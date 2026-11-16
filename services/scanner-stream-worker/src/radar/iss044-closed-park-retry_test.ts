import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeRadarConfig } from "./config.ts";
import { createRadarEngine } from "./engine.ts";
import {
  createClosedParkRecovery,
  createMemoryRadarV2Store,
  createRadarV2WriteGate,
  isClosedParkFullyCommitted,
  isParkBackoffResult,
  isRadarV2PublishCommitted,
  publishRadarV2ClosedParkIfNeeded,
  RADAR_V2_PARK_RETRY_INTERVAL_MS,
  shouldAttemptParkRpc,
  type RadarV2RpcFn,
} from "./persist_v2.ts";
import type { ReplaceRadarV2Args } from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";
import type { EligibleQuote } from "./types.ts";
import { radarSessionKindAt } from "./session.ts";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN_CLOSED = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const SYNC = "2026-08-10T14:00:05.000Z";

const ET = {
  firstAh: Date.parse("2026-08-10T20:00:00.000Z"),
  mon2000: Date.parse("2026-08-11T00:00:00.000Z"),
  tue0400: Date.parse("2026-08-11T08:00:00.000Z"),
  sat1000: Date.parse("2026-08-08T14:00:00.000Z"),
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

function parkEval() {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.firstAh, 80_000, 10, 11, 9), ET.firstAh);
  engine.evaluate(ET.firstAh + 50, GEN);
  const closed = engine.evaluate(ET.mon2000, GEN);
  return { engine, closed };
}

function recoveryFor(
  closed: { persistenceV2: { tradingDate: string } },
  wallNow: number,
) {
  return createClosedParkRecovery({
    tradingDate: closed.persistenceV2.tradingDate,
    flushGenerationId: GEN,
    flushSyncedAt: SYNC,
    closedGenerationId: GEN_CLOSED,
    closedSyncedAt: new Date(wallNow + 1).toISOString(),
  });
}

Deno.test("ISS-044: first park attempt succeeds (flush + closed)", async () => {
  const { engine, closed } = parkEval();
  assertEquals(closed.sessionTransition, "park_closed");
  assert(closed.preParkFlush);

  const payloads: ReplaceRadarV2Args[] = [];
  const rpc: RadarV2RpcFn = async (input) => {
    payloads.push(input);
    return { error: null, data: { applied: true, reason: "replaced" } };
  };
  const recovery = recoveryFor(closed, ET.mon2000);
  const out = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc,
    recovery,
  });
  assert(out !== "skipped" && !isParkBackoffResult(out));
  assertEquals(isClosedParkFullyCommitted(out, recovery, closed.preParkFlush), true);
  assertEquals(payloads.length, 2);
  assertEquals(payloads[0]?.p_generation_id, GEN);
  assertEquals(payloads[1]?.p_generation_id, GEN_CLOSED);
  assertEquals(recovery.stage, "closed");
  engine.acknowledgeClosedParkCommitted();
  assertEquals(engine.hasPendingClosedPark(), false);
});

Deno.test("ISS-044: park RPC backoff spaces attempts across minutes", async () => {
  const { closed } = parkEval();
  const recovery = recoveryFor(closed, ET.mon2000);
  recovery.lastRpcAttemptMs = ET.mon2000;
  let calls = 0;
  const out = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000 + RADAR_V2_PARK_RETRY_INTERVAL_MS - 1,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc: async () => {
      calls += 1;
      return { error: null };
    },
    recovery,
  });
  assertEquals(isParkBackoffResult(out), true);
  assertEquals(calls, 0);
  assertEquals(
    shouldAttemptParkRpc(recovery, ET.mon2000 + RADAR_V2_PARK_RETRY_INTERVAL_MS),
    true,
  );
});

Deno.test("ISS-044: multi-minute DB outage bounds park RPC attempts", async () => {
  const { closed } = parkEval();
  const recovery = recoveryFor(closed, ET.mon2000);
  let calls = 0;
  const failRpc: RadarV2RpcFn = async () => {
    calls += 1;
    return { error: { message: "db unavailable" } };
  };
  const outageMs = 5 * 60_000;
  const evalEveryMs = 5_000;
  for (let elapsed = 0; elapsed <= outageMs; elapsed += evalEveryMs) {
    await publishRadarV2ClosedParkIfNeeded({
      flagEnabled: true,
      result: closed,
      gate: createRadarV2WriteGate(),
      wallNowMs: ET.mon2000 + elapsed,
      checkpointMs: CHECKPOINT,
      generationId: GEN,
      syncedAt: SYNC,
      recovery,
      rpc: failRpc,
    });
  }
  const expectedAttempts = 1 + Math.floor(outageMs / RADAR_V2_PARK_RETRY_INTERVAL_MS);
  assertEquals(calls, expectedAttempts);
  assertEquals(recovery.stage, "flush");
});

Deno.test("ISS-044: failed flush then retry reuses stable flush identity", async () => {
  const { engine, closed: first } = parkEval();
  const snapshotLen = first.preParkFlush?.candidates.length ?? 0;
  const recovery = recoveryFor(first, ET.mon2000);

  let calls = 0;
  const fail = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: first,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc: async () => {
      calls += 1;
      return { error: { message: "boom" } };
    },
  });
  assertEquals(fail, { ok: false, code: "persist_failed" });
  assertEquals(calls, 1);
  assertEquals(recovery.stage, "flush");
  assertEquals(engine.hasPendingClosedPark(), true);

  const retry = engine.evaluate(ET.mon2000 + 60_000, GEN);
  assertEquals(retry.sessionTransition, "park_closed");
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
    wallNowMs: ET.mon2000 + RADAR_V2_PARK_RETRY_INTERVAL_MS,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc: okRpc,
  });
  assert(out !== "skipped" && !isParkBackoffResult(out));
  assertEquals(isClosedParkFullyCommitted(out, recovery, retry.preParkFlush), true);
  assertEquals(calls, 2);
  assertEquals(payloads[0]?.p_candidates.length, snapshotLen);
  assertEquals(payloads[0]?.p_generation_id, GEN);
  assertEquals(payloads[1]?.p_generation_id, GEN_CLOSED);
  engine.acknowledgeClosedParkCommitted();
});

Deno.test("ISS-044: flush committed then closed timeout retries closed only", async () => {
  const { closed } = parkEval();
  const recovery = recoveryFor(closed, ET.mon2000);
  const store = createMemoryRadarV2Store();
  let phase = 0;
  const rpc: RadarV2RpcFn = async (input) => {
    if (input.p_session_kind === "after-hours") {
      const r = store.apply(input);
      phase = 1;
      return { error: null, data: { applied: r.applied, reason: r.reason } };
    }
    phase = 2;
    return { error: { message: "timeout" } };
  };
  const first = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc,
  });
  assertEquals(recovery.stage, "closed");
  assertEquals(phase, 2);
  assertEquals(first, { ok: false, code: "persist_failed" });
  assertEquals(store.sessionKind, "after-hours");
  assert(store.candidates.length > 0);

  const retryClosed = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000 + RADAR_V2_PARK_RETRY_INTERVAL_MS,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc: async (input) => {
      assertEquals(input.p_session_kind, "closed");
      assertEquals(input.p_candidates.length, 0);
      assertEquals(input.p_generation_id, GEN_CLOSED);
      const r = store.apply(input);
      return { error: null, data: { applied: r.applied, reason: r.reason } };
    },
  });
  assert(retryClosed !== "skipped" && !isParkBackoffResult(retryClosed));
  assert(isRadarV2PublishCommitted(retryClosed));
  assertEquals(store.sessionKind, "closed");
  assertEquals(store.candidates.length, 0);
});

Deno.test("ISS-044: closed already_current must not replay AH flush", async () => {
  const { closed } = parkEval();
  const recovery = recoveryFor(closed, ET.mon2000);
  const store = createMemoryRadarV2Store();
  const flushArgs = closed.preParkFlush!;
  const rpc: RadarV2RpcFn = async (input) => {
    const r = store.apply(input);
    return { error: null, data: { applied: r.applied, reason: r.reason } };
  };
  await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc: async (input) => {
      const r = store.apply(input);
      return { error: null, data: { applied: r.applied, reason: r.reason } };
    },
  });
  assertEquals(recovery.stage, "closed");
  assertEquals(store.sessionKind, "closed");
  let ahReplay = 0;
  const lostResponse = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000 + RADAR_V2_PARK_RETRY_INTERVAL_MS,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc: async (input) => {
      if (input.p_session_kind === "after-hours") ahReplay += 1;
      if (input.p_session_kind === "closed") {
        return {
          error: null,
          data: { applied: true, reason: "already_current" },
        };
      }
      return { error: null, data: { applied: false, reason: "stale_generation" } };
    },
  });
  assertEquals(ahReplay, 0);
  assert(isClosedParkFullyCommitted(lostResponse, recovery, closed.preParkFlush));
  assertEquals(store.sessionKind, "closed");
  assertEquals(store.candidates.length, 0);
});

Deno.test("ISS-044: stale_generation reject does not clear pending park", async () => {
  const { engine, closed } = parkEval();
  const recovery = recoveryFor(closed, ET.mon2000);
  const out = await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc: async () => ({
      error: null,
      data: { applied: false, reason: "stale_generation" },
    }),
  });
  assertEquals(out, { ok: false, code: "stale_generation" });
  assertEquals(engine.hasPendingClosedPark(), true);
  assertEquals(recovery.stage, "flush");
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

Deno.test("ISS-044: 04:00 hard reset clears pending overnight park", () => {
  const { engine, closed } = parkEval();
  assert(engine.hasPendingClosedPark());
  const reset = engine.evaluate(ET.tue0400, GEN);
  assertEquals(reset.sessionTransition, "hard_reset");
  assertEquals(engine.hasPendingClosedPark(), false);
});

Deno.test("ISS-044: distinct flush/closed generation fences", async () => {
  const { closed } = parkEval();
  const recovery = recoveryFor(closed, ET.mon2000);
  const payloads: ReplaceRadarV2Args[] = [];
  await publishRadarV2ClosedParkIfNeeded({
    flagEnabled: true,
    result: closed,
    gate: createRadarV2WriteGate(),
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    recovery,
    rpc: async (input) => {
      payloads.push(input);
      return { error: null, data: { applied: true, reason: "replaced" } };
    },
  });
  assertEquals(payloads.length, 2);
  assert(payloads[1]!.p_synced_at > payloads[0]!.p_synced_at);
  assert(payloads[1]!.p_generation_id !== payloads[0]!.p_generation_id);
});