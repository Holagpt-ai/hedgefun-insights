import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeRadarConfig } from "./config.ts";
import { createRadarEngine } from "./engine.ts";
import {
  createRadarV2WriteGate,
  isRadarV2PublishCommitted,
  publishRadarV2ClosedParkIfNeeded,
  type RadarV2RpcFn,
} from "./persist_v2.ts";
import type { ReplaceRadarV2Args } from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";
import type { EligibleQuote } from "./types.ts";
import { radarSessionKindAt } from "./session.ts";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SYNC = "2026-08-10T14:00:05.000Z";

const ET = {
  firstAh: Date.parse("2026-08-10T20:00:00.000Z"),
  mon2000: Date.parse("2026-08-11T00:00:00.000Z"),
  sat1000: Date.parse("2026-08-08T14:00:00.000Z"),
  mon092959999: Date.parse("2026-08-10T13:29:59.999Z"),
};

const CHECKPOINT = 30_000;

function quote(symbol: string): EligibleQuote {
  return {
    symbol,
    companyName: symbol,
    regularClose: 10,
    previousClose: 8,
    dayVolume: 2_000_000,
    priorVolume: 100_000,
    dayHigh: 12,
    dayLow: 8,
    volumeRatio: 20,
    changePercent: 25,
  };
}

function aggRaw(
  s: number,
  v: number,
  c: number,
  h = c,
  l = c,
  sym = "AAA",
): Record<string, unknown> {
  return {
    ev: "A",
    sym,
    v,
    av: v,
    op: c,
    vw: c,
    o: c,
    c,
    h,
    l,
    a: c,
    z: 10,
    s,
    e: s + 1_000,
  };
}

function sentinelEngine() {
  const engine = createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: true }),
    exceptions: [],
  });
  engine.setUniverse(new Map([["AAA", quote("AAA")]]));
  return engine;
}

Deno.test("ISS-044: first park attempt succeeds (flush + closed)", async () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.firstAh, 80_000, 10, 11, 9), ET.firstAh);
  engine.evaluate(ET.firstAh + 50, GEN);
  const closed = engine.evaluate(ET.mon2000, GEN);
  assertEquals(closed.sessionTransition, "park_closed");
  assert(closed.preParkFlush);

  const payloads: ReplaceRadarV2Args[] = [];
  const rpc: RadarV2RpcFn = async (input) => {
    payloads.push(input);
    return { error: null, data: { applied: true, reason: "replaced" } };
  };
  const out = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc,
    newId: () => GEN,
  });
  assert(out !== "skipped");
  assertEquals(isRadarV2PublishCommitted(out), true);
  assertEquals(payloads.length, 2);
  engine.acknowledgeClosedParkCommitted();
  assertEquals(engine.hasPendingClosedPark(), false);
});

Deno.test("ISS-044: failed flush then retry reuses frozen pre-park snapshot", async () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.firstAh, 80_000, 10, 11, 9), ET.firstAh);
  engine.evaluate(ET.firstAh + 50, GEN);
  const first = engine.evaluate(ET.mon2000, GEN);
  const snapshotLen = first.preParkFlush?.candidates.length ?? 0;
  assert(snapshotLen > 0);

  let calls = 0;
  const rpc: RadarV2RpcFn = async () => {
    calls += 1;
    return { error: { message: "boom" } };
  };
  const fail = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: first,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc,
  });
  assertEquals(fail, { ok: false, code: "persist_failed" });
  assertEquals(calls, 1);
  assertEquals(engine.hasPendingClosedPark(), true);

  const retry = engine.evaluate(ET.mon2000 + 60_000, GEN);
  assertEquals(retry.sessionTransition, "park_closed");
  assertEquals(retry.preParkFlush?.candidates.length, snapshotLen);

  calls = 0;
  const payloads: ReplaceRadarV2Args[] = [];
  const okRpc: RadarV2RpcFn = async (input) => {
    calls += 1;
    payloads.push(input);
    return { error: null, data: { applied: true, reason: "replaced" } };
  };
  const out = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: retry,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000 + 60_000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc: okRpc,
    newId: () => "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
  });
  assert(out !== "skipped");
  assertEquals(isRadarV2PublishCommitted(out), true);
  assertEquals(calls, 2);
  assertEquals(payloads[0]?.p_candidates.length, snapshotLen);
  engine.acknowledgeClosedParkCommitted();
});

Deno.test("ISS-044: stale_generation reject does not clear pending park", async () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.firstAh, 80_000, 10, 11, 9), ET.firstAh);
  engine.evaluate(ET.firstAh + 50, GEN);
  const closed = engine.evaluate(ET.mon2000, GEN);

  const rpc: RadarV2RpcFn = async () => ({
    error: null,
    data: { applied: false, reason: "stale_generation" },
  });
  const out = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc,
  });
  assertEquals(out, { ok: false, code: "stale_generation" });
  assertEquals(engine.hasPendingClosedPark(), true);
});

Deno.test("ISS-044: cold engine at closed has no outstanding park", () => {
  const engine = sentinelEngine();
  const closed = engine.evaluate(ET.mon2000, GEN);
  assertEquals(closed.sessionTransition, null);
  assertEquals(engine.hasPendingClosedPark(), false);
});

Deno.test("ISS-044: weekend closed does not fabricate park_closed", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.sat1000, 80_000, 10, 11, 9), ET.sat1000);
  engine.evaluate(ET.sat1000 + 50, GEN);
  const sat = engine.evaluate(ET.sat1000 + 3_600_000, GEN);
  assertEquals(radarSessionKindAt(ET.sat1000 + 3_600_000, []), "closed");
  assertEquals(sat.sessionTransition, null);
  assertEquals(engine.hasPendingClosedPark(), false);
});

Deno.test("ISS-044: duplicate closed parks use distinct generation fences", async () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.firstAh, 80_000, 10, 11, 9), ET.firstAh);
  engine.evaluate(ET.firstAh + 50, GEN);
  const closed = engine.evaluate(ET.mon2000, GEN);
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ];
  let idIx = 0;
  const payloads: ReplaceRadarV2Args[] = [];
  const rpc: RadarV2RpcFn = async (input) => {
    payloads.push(input);
    return { error: null, data: { applied: true, reason: "replaced" } };
  };
  await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: ids[idIx],
    syncedAt: SYNC,
    rpc,
    newId: () => ids[1],
  });
  assertEquals(payloads.length, 2);
  assert(payloads[1]!.p_synced_at > payloads[0]!.p_synced_at);
  assert(payloads[1]!.p_generation_id !== payloads[0]!.p_generation_id);
});