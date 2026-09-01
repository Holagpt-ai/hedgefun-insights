import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeRadarConfig } from "./config.ts";
import { createRadarEngine, persistableGeneration } from "./engine.ts";
import { REPLACE_RADAR_RPC } from "./persist.ts";
import {
  buildRadarV2Events,
  createMemoryRadarV2Store,
  createRadarV2WriteGate,
  dualWriteRadarPersistence,
  eventKey,
  fingerprintRadarV2Generation,
  publishRadarV2Generation,
  publishRadarV2IfNeeded,
  RADAR_V22_CANDIDATE_CAP,
  REPLACE_RADAR_V2_RPC,
  replaceArgsFromView,
  shouldPublishRadarV2,
  validateRadarV2Generation,
  type PersistenceV2View,
  type RadarV2ChurnInput,
  type RadarV2RpcFn,
} from "./persist_v2.ts";
import type {
  RadarV22CandidateRow,
  ReplaceRadarV2Args,
} from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";
import type { EligibleQuote } from "./types.ts";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN2 = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const SYNC = "2026-08-10T14:00:05.000Z";
const DATE = "2026-08-10";

const ET = {
  pm: Date.parse("2026-08-10T12:30:00.000Z"),
  rthOpen: Date.parse("2026-08-10T13:30:00.000Z"),
  rthMid: Date.parse("2026-08-10T14:47:00.000Z"),
  firstAh: Date.parse("2026-08-10T20:00:00.000Z"),
  tue0400: Date.parse("2026-08-11T08:00:00.000Z"),
  sat1000: Date.parse("2026-08-08T14:00:00.000Z"),
  mon2000: Date.parse("2026-08-11T00:00:00.000Z"),
};

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

function candidate(symbol: string, overrides: Partial<RadarV22CandidateRow> = {}): RadarV22CandidateRow {
  return {
    generation_id: GEN,
    trading_date: DATE,
    session_kind: "market",
    symbol,
    lifecycle: "DETECTED",
    signal_status: "BUILDING",
    last_price: 10,
    last_price_at: SYNC,
    move_15s_pct: 0.4,
    move_60s_pct: null,
    volume_5s: 1_000,
    volume_15s: 2_000,
    volume_60s: 3_000,
    session_volume: 4_000,
    dollar_volume_60s: 40_000,
    acceleration_5m: null,
    session_high: 11,
    session_low: 9,
    distance_from_hod_pct: 9.09,
    session_vwap: 10.1,
    vwap_side: "above",
    geometry_partial: true,
    vwap_partial: true,
    last_new_hod_at: SYNC,
    last_hod_attempt_at: null,
    last_hod_break_at: SYNC,
    last_hod_reject_at: null,
    last_vwap_cross_at: SYNC,
    last_vwap_reclaim_at: SYNC,
    last_vwap_loss_at: null,
    freshness_class: "fresh",
    freshness_age_ms: 1_000,
    last_volume_burst_at: SYNC,
    last_price_move_at: SYNC,
    last_acceleration_at: null,
    promoted_at: SYNC,
    lifecycle_entered_at: SYNC,
    provider_as_of: SYNC,
    updated_at: SYNC,
    ...overrides,
  };
}

function args(candidates: RadarV22CandidateRow[], events: ReplaceRadarV2Args["p_events"] = []): ReplaceRadarV2Args {
  return {
    p_generation_id: GEN,
    p_trading_date: DATE,
    p_session_kind: "market",
    p_synced_at: SYNC,
    p_candidates: candidates,
    p_events: events,
    p_sentinel_enabled: true,
    p_last_provider_event_at: SYNC,
    p_last_receive_at: SYNC,
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

Deno.test("1-3. candidate batch supports 21, 128, and 200; rejects 201", () => {
  const store = createMemoryRadarV2Store();
  store.apply(args(Array.from({ length: 21 }, (_, i) => candidate(`A${i}`))));
  assertEquals(store.candidates.length, 21);
  store.apply(args(Array.from({ length: 128 }, (_, i) => candidate(`B${i}`))));
  assertEquals(store.candidates.length, 128);
  const twoHundred = Array.from({ length: 200 }, (_, i) => candidate(`C${i}`));
  store.apply(args(twoHundred));
  assertEquals(store.candidates.length, 200);
  assertEquals(RADAR_V22_CANDIDATE_CAP, 200);
  assertEquals(validateRadarV2Generation(args([...twoHundred, candidate("Z1")])), false);
});

Deno.test("4-6. one current row per symbol; atomic generation replace; no mix", () => {
  const store = createMemoryRadarV2Store();
  store.apply(args([candidate("AAA"), candidate("BBB")]));
  const next = args([candidate("AAA", { generation_id: GEN2, last_price: 12 })]);
  next.p_generation_id = GEN2;
  store.apply(next);
  assertEquals(store.candidates.length, 1);
  assertEquals(store.candidates[0].symbol, "AAA");
  assertEquals(store.candidates[0].generation_id, GEN2);
  assertEquals(store.candidates.some((row) => row.symbol === "BBB"), false);
  assertEquals(store.v2GenerationId, GEN2);
});

Deno.test("17-18. event insert is idempotent across retry", () => {
  const store = createMemoryRadarV2Store();
  const events = buildRadarV2Events({
    generationId: GEN,
    tradingDate: DATE,
    sessionKind: "market",
    candidates: [candidate("AAA")],
    sessionTransition: null,
    sessionEventAt: null,
    archived: [],
  });
  store.apply(args([candidate("AAA")], events));
  const count = store.events.length;
  store.apply(args([candidate("AAA")], events));
  assertEquals(store.events.length, count);
  assertEquals(new Set(store.events.map(eventKey)).size, count);
});

Deno.test("19-21. lifecycle, HOD, and VWAP events are represented", () => {
  const events = buildRadarV2Events({
    generationId: GEN,
    tradingDate: DATE,
    sessionKind: "market",
    candidates: [candidate("AAA")],
    sessionTransition: null,
    sessionEventAt: null,
    archived: [{ symbol: "BBB", eventAt: SYNC }],
  });
  const types = new Set(events.map((e) => e.event_type));
  assert(types.has("DETECTED"));
  assert(types.has("NEW_HOD"));
  assert(types.has("HOD_BREAK"));
  assert(types.has("VWAP_RECLAIM"));
  assert(types.has("PROMOTED"));
  assert(types.has("ARCHIVED"));
  assertEquals(types.has("VOLUME_BURST" as never), false);
});

Deno.test("22. volume burst/acceleration are not discrete events", () => {
  const events = buildRadarV2Events({
    generationId: GEN,
    tradingDate: DATE,
    sessionKind: "market",
    candidates: [candidate("AAA", { last_acceleration_at: SYNC })],
    sessionTransition: null,
    sessionEventAt: null,
    archived: [],
  });
  assertEquals(events.some((e) => String(e.event_type).includes("BURST")), false);
  assertEquals(events.some((e) => String(e.event_type).includes("ACCEL")), false);
});

Deno.test("23. candidate replacement does not append history", () => {
  const store = createMemoryRadarV2Store();
  store.apply(args([candidate("AAA")]));
  store.apply(args([candidate("AAA", { last_price: 11 })]));
  store.apply(args([candidate("AAA", { last_price: 12 })]));
  assertEquals(store.candidates.length, 1);
});

Deno.test("24. old Top-20 RPC name unchanged", () => {
  assertEquals(REPLACE_RADAR_RPC, "replace_radar_v22_generation_v1");
  assertEquals(REPLACE_RADAR_V2_RPC, "replace_radar_v22_candidates_v1");
});

Deno.test("25-26. Persistence V2 flag defaults off and skips writes", () => {
  assertEquals(shouldPublishRadarV2(false, {
    staleTransition: false,
    liveSurveillance: true,
    sessionReset: false,
    persistEmpty: false,
    sessionKind: "market",
  }), false);
  assertEquals(shouldPublishRadarV2(true, {
    staleTransition: false,
    liveSurveillance: true,
    sessionReset: false,
    persistEmpty: false,
    sessionKind: "market",
  }), true);
});

Deno.test("27-28. V2 failure does not stop V1 or reject", async () => {
  let v1Called = false;
  const out = await dualWriteRadarPersistence({
    v1: async () => {
      v1Called = true;
      return { ok: true };
    },
    v2: async () => {
      throw new Error("boom");
    },
  });
  assertEquals(v1Called, true);
  assertEquals(out.v1, { ok: true });
  assertEquals(out.v2, { ok: false, code: "persist_failed" });
});

Deno.test("31. schema/RPC validator rejects malformed payload", () => {
  assertEquals(validateRadarV2Generation(args([candidate("aaa")])), false);
  assertEquals(validateRadarV2Generation(args([candidate("AAA"), candidate("AAA")])), false);
  const bad = args([candidate("AAA")]);
  bad.p_session_kind = "rth" as never;
  assertEquals(validateRadarV2Generation(bad), false);
});

Deno.test("flag-off helper skips even when live", () => {
  assertEquals(shouldPublishRadarV2(false, {
    staleTransition: false,
    liveSurveillance: true,
    sessionReset: true,
    persistEmpty: true,
    sessionKind: "closed",
  }), false);
});

Deno.test("7-13, 32-34. engine PM/RTH/AH geometry, partial, freshness, resets", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.pm, 80_000, 10, 16, 9), ET.pm);
  const pm = engine.evaluate(ET.pm + 50, GEN);
  assertEquals(pm.sessionKind, "pre-market");
  assertEquals(pm.published, false);
  assertEquals(persistableGeneration(pm).rows.length, 0);
  const pmRow = pm.persistenceV2.candidates.find((r) => r.symbol === "AAA");
  assert(pmRow);
  assertEquals(pmRow.session_kind, "pre-market");
  assertEquals(pmRow.session_high, 16);
  assertEquals(typeof pmRow.freshness_class, "string");
  assertEquals(typeof pmRow.freshness_age_ms, "number");
  assertEquals(pm.persistenceV2.feedStale, false);

  engine.ingest(aggRaw(ET.rthOpen, 1_000, 12, 12, 11), ET.rthOpen);
  const rth = engine.evaluate(ET.rthOpen, GEN);
  const rthRow = rth.persistenceV2.candidates.find((r) => r.symbol === "AAA");
  assert(rthRow);
  assertEquals(rthRow.session_kind, "market");
  assertEquals(rthRow.session_high, 12);
  assertEquals(rthRow.session_high === 16, false);

  engine.ingest(aggRaw(ET.firstAh, 1_000, 8, 8.5, 7.5), ET.firstAh);
  const ah = engine.evaluate(ET.firstAh, GEN);
  const ahRow = ah.persistenceV2.candidates.find((r) => r.symbol === "AAA");
  assert(ahRow);
  assertEquals(ahRow.session_kind, "after-hours");
  assertEquals(ahRow.session_high, 8.5);

  const closed = engine.evaluate(ET.mon2000, GEN);
  assertEquals(closed.sessionKind, "closed");
  assertEquals(closed.persistenceV2.candidates.length, 0);

  const reset = engine.evaluate(ET.tue0400, GEN);
  assertEquals(reset.sessionReset, true);
  assertEquals(reset.persistenceV2.candidates.length, 0);

  const weekend = createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: true }),
    exceptions: [],
  });
  const sat = weekend.evaluate(ET.sat1000, GEN);
  assertEquals(sat.sessionKind, "closed");
  assertEquals(sat.persistenceV2.candidates.length, 0);
});

Deno.test("10-16. mid-session partial and HOD/VWAP timestamps persist on snapshot", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.rthMid, 80_000, 10, 11, 9), ET.rthMid);
  const mid = engine.evaluate(ET.rthMid + 50, GEN);
  const row = mid.persistenceV2.candidates.find((r) => r.symbol === "AAA");
  assert(row);
  assertEquals(row.geometry_partial, true);
  assertEquals(row.vwap_partial, true);
  assertEquals(row.last_new_hod_at !== null, true);
  assertEquals(row.session_vwap !== null, true);
  assertEquals(mid.board.feedStale, false);
});

Deno.test("14. symbol freshness is independent of feed stale", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.rthOpen, 80_000, 10), ET.rthOpen);
  const live = engine.evaluate(ET.rthOpen + 50, GEN);
  const row = live.persistenceV2.candidates[0];
  assert(row);
  assertEquals(live.board.feedStale, false);
  assertEquals(row.freshness_class, "fresh");
  const stale = engine.evaluate(ET.rthOpen + 50 + 16_000, GEN);
  assertEquals(stale.staleTransition, true);
  assertEquals(stale.board.feedStale, true);
  assertEquals(shouldPublishRadarV2(true, stale), false);
});

Deno.test("30. publishRadarV2Generation accepts a valid payload", async () => {
  const calls: ReplaceRadarV2Args[] = [];
  const rpc: RadarV2RpcFn = async (input) => {
    calls.push(input);
    return { error: null };
  };
  const result = await publishRadarV2Generation(rpc, args([candidate("AAA")]));
  assertEquals(result.ok, true);
  assertEquals(calls.length, 1);
});

Deno.test("migration contract names match worker RPC constant", () => {
  assertEquals(REPLACE_RADAR_V2_RPC, "replace_radar_v22_candidates_v1");
  assertEquals(RADAR_V22_CANDIDATE_CAP, 200);
  assertEquals(REPLACE_RADAR_RPC, "replace_radar_v22_generation_v1");
});

Deno.test("replaceArgsFromView stamps events and preserves session kind", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.rthOpen, 80_000, 10, 11, 9), ET.rthOpen);
  const result = engine.evaluate(ET.rthOpen + 50, GEN);
  const payload = replaceArgsFromView({
    generationId: GEN,
    syncedAt: SYNC,
    view: result.persistenceV2,
  });
  assertEquals(payload.p_session_kind, "market");
  assertEquals(payload.p_candidates.length >= 1, true);
  assertEquals(payload.p_events.some((e) => e.event_type === "NEW_HOD"), true);
});

const CHECKPOINT = 30_000;
const EVENT = {
  trading_date: DATE,
  session_kind: "market" as const,
  symbol: "AAA",
  event_type: "DETECTED" as const,
  event_at: SYNC,
  generation_id: GEN,
};

function churnInput(
  candidates: RadarV22CandidateRow[],
  overrides: Partial<RadarV2ChurnInput> = {},
): RadarV2ChurnInput {
  return {
    wallNowMs: 0,
    checkpointMs: CHECKPOINT,
    tradingDate: DATE,
    sessionKind: "market",
    candidates,
    events: [EVENT],
    sessionTransition: null,
    sessionReset: false,
    ...overrides,
  };
}

function commit(
  gate: ReturnType<typeof createRadarV2WriteGate>,
  candidates: RadarV22CandidateRow[],
  wallNowMs: number,
  overrides: Partial<RadarV2ChurnInput> = {},
) {
  const decision = gate.decide(
    churnInput(candidates, { wallNowMs, ...overrides }),
  );
  if (decision.shouldWrite) gate.markSuccess(decision, wallNowMs);
  return decision;
}

function v2View(
  candidates: RadarV22CandidateRow[],
  extra: Partial<PersistenceV2View> = {},
): PersistenceV2View {
  return {
    tradingDate: DATE,
    sessionKind: "market",
    liveSurveillance: true,
    sessionTransition: null,
    sentinelEnabled: true,
    feedStale: false,
    lastReceiveAt: SYNC,
    lastProviderEventAt: SYNC,
    candidates,
    archived: [],
    ...extra,
  };
}

Deno.test("churn 1-3. identical snapshots skip until checkpoint", () => {
  const gate = createRadarV2WriteGate();
  const rows = [candidate("AAA")];
  const first = commit(gate, rows, 0);
  assertEquals(first.shouldWrite, true);
  assertEquals(first.reason, "bootstrap");
  const t5 = gate.decide(churnInput(rows, { wallNowMs: 5_000 }));
  assertEquals(t5.shouldWrite, false);
  assertEquals(t5.reason, "skip");
  const t10 = gate.decide(churnInput(rows, { wallNowMs: 10_000 }));
  assertEquals(t10.shouldWrite, false);
  const ck = gate.decide(churnInput(rows, { wallNowMs: 30_000 }));
  assertEquals(ck.shouldWrite, true);
  assertEquals(ck.reason, "checkpoint");
});

Deno.test("churn 4-8. material field changes write immediately", () => {
  const rows = [candidate("AAA")];
  const cases: Array<[string, RadarV22CandidateRow]> = [
    ["price", candidate("AAA", { last_price: 10.05 })],
    ["volume", candidate("AAA", { volume_5s: 2_000 })],
    ["acceleration", candidate("AAA", { acceleration_5m: 2.5 })],
    ["lifecycle", candidate("AAA", { lifecycle: "ACTIVE", signal_status: "ACTIVE" })],
    ["freshness_class", candidate("AAA", { freshness_class: "stale" })],
  ];
  for (const [label, next] of cases) {
    const gate = createRadarV2WriteGate();
    commit(gate, rows, 0);
    const decision = gate.decide(churnInput([next], { wallNowMs: 5_000 }));
    assertEquals(decision.shouldWrite, true, label);
    assertEquals(decision.reason, "fingerprint", label);
  }
});

Deno.test("churn 9-12. wall-clock and generation fields do not churn", () => {
  const gate = createRadarV2WriteGate();
  commit(gate, [candidate("AAA")], 0);
  const ignored: Array<[string, RadarV22CandidateRow]> = [
    ["freshness_age_ms", candidate("AAA", { freshness_age_ms: 9_000 })],
    ["provider_as_of", candidate("AAA", { provider_as_of: "2026-08-10T14:00:09.000Z" })],
    ["generation_id", candidate("AAA", { generation_id: GEN2 })],
    ["updated_at", candidate("AAA", { updated_at: "2026-08-10T14:00:10.000Z" })],
  ];
  for (const [label, next] of ignored) {
    const decision = gate.decide(churnInput([next], { wallNowMs: 5_000 }));
    assertEquals(decision.shouldWrite, false, label);
  }
  assertEquals(
    fingerprintRadarV2Generation(DATE, "market", [candidate("AAA")]),
    fingerprintRadarV2Generation(DATE, "market", [
      candidate("AAA", {
        generation_id: GEN2,
        updated_at: "2026-08-10T14:00:10.000Z",
        freshness_age_ms: 9_000,
        provider_as_of: "2026-08-10T14:00:09.000Z",
        last_price_at: "2026-08-10T14:00:09.000Z",
      }),
    ]),
  );
});

Deno.test("churn 13-14. membership add and remove write immediately", () => {
  const gate = createRadarV2WriteGate();
  commit(gate, [candidate("AAA")], 0);
  const added = gate.decide(
    churnInput([candidate("AAA"), candidate("BBB")], { wallNowMs: 5_000 }),
  );
  assertEquals(added.shouldWrite, true);
  assertEquals(added.reason, "fingerprint");
  gate.markSuccess(added, 5_000);
  const removed = gate.decide(
    churnInput([candidate("AAA")], { wallNowMs: 10_000 }),
  );
  assertEquals(removed.shouldWrite, true);
  assertEquals(removed.reason, "fingerprint");
});

Deno.test("churn 15-18. session transitions force an immediate write", () => {
  const rows = [candidate("AAA")];
  const transitions: Array<[string, Partial<RadarV2ChurnInput>]> = [
    ["PM→RTH", { sessionTransition: "soft_pm_rth" }],
    ["RTH→AH", { sessionTransition: "soft_rth_ah" }],
    ["20:00", { sessionTransition: "park_closed", sessionKind: "closed" }],
    ["04:00", { sessionReset: true, sessionKind: "pre-market" }],
  ];
  for (const [label, extra] of transitions) {
    const gate = createRadarV2WriteGate();
    commit(gate, rows, 0);
    const decision = gate.decide(
      churnInput(rows, { wallNowMs: 5_000, ...extra }),
    );
    assertEquals(decision.shouldWrite, true, label);
    assertEquals(decision.reason, "session", label);
  }
});

Deno.test("churn 19-20. new events write immediately; retries stay idempotent", () => {
  const gate = createRadarV2WriteGate();
  const rows = [candidate("AAA")];
  commit(gate, rows, 0);
  const hod = {
    ...EVENT,
    event_type: "NEW_HOD" as const,
    event_at: "2026-08-10T14:00:04.000Z",
  };
  const withNew = gate.decide(
    churnInput(rows, { wallNowMs: 5_000, events: [EVENT, hod] }),
  );
  assertEquals(withNew.shouldWrite, true);
  assertEquals(withNew.reason, "events");
  gate.markSuccess(withNew, 5_000);
  const retry = gate.decide(
    churnInput(rows, { wallNowMs: 10_000, events: [EVENT, hod] }),
  );
  assertEquals(retry.shouldWrite, false);
  const store = createMemoryRadarV2Store();
  const payloadEvents = [EVENT, hod];
  store.apply(args(rows, payloadEvents));
  store.apply(args(rows, payloadEvents));
  assertEquals(store.events.length, 2);
  assertEquals(new Set(store.events.map(eventKey)).size, 2);
});

Deno.test("churn 21-23. failed V2 write does not update fingerprint and retries", async () => {
  const gate = createRadarV2WriteGate();
  const rows = [candidate("AAA")];
  let fail = true;
  let calls = 0;
  const rpc: RadarV2RpcFn = async () => {
    calls += 1;
    if (fail) return { error: { message: "down" } };
    return { error: null };
  };
  const live = {
    staleTransition: false,
    liveSurveillance: true,
    sessionReset: false,
    persistEmpty: false,
    sessionKind: "market",
    sessionTransition: null,
    persistenceV2: v2View(rows),
  };
  const first = await publishRadarV2IfNeeded({
    flagEnabled: true,
    result: live,
    gate,
    wallNowMs: 0,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc,
  });
  assertEquals(first, { ok: false, code: "persist_failed" });
  assertEquals(calls, 1);
  fail = false;
  const retry = await publishRadarV2IfNeeded({
    flagEnabled: true,
    result: live,
    gate,
    wallNowMs: 5_000,
    checkpointMs: CHECKPOINT,
    generationId: GEN2,
    syncedAt: "2026-08-10T14:00:10.000Z",
    rpc,
  });
  assertEquals(retry, { ok: true });
  assertEquals(calls, 2);
  const skipped = await publishRadarV2IfNeeded({
    flagEnabled: true,
    result: live,
    gate,
    wallNowMs: 10_000,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: "2026-08-10T14:00:15.000Z",
    rpc,
  });
  assertEquals(skipped, "skipped");
  assertEquals(calls, 2);
});

Deno.test("churn 24-26. flag off skips RPC; V1 dual-write unaffected; failure isolated", async () => {
  let v2Calls = 0;
  const rpc: RadarV2RpcFn = async () => {
    v2Calls += 1;
    return { error: null };
  };
  const skipped = await publishRadarV2IfNeeded({
    flagEnabled: false,
    result: {
      staleTransition: false,
      liveSurveillance: true,
      sessionReset: false,
      persistEmpty: false,
      sessionKind: "market",
      sessionTransition: null,
      persistenceV2: v2View([candidate("AAA")]),
    },
    gate: createRadarV2WriteGate(),
    wallNowMs: 0,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc,
  });
  assertEquals(skipped, "skipped");
  assertEquals(v2Calls, 0);

  let v1Called = false;
  const dual = await dualWriteRadarPersistence({
    v1: async () => {
      v1Called = true;
      return { ok: true };
    },
    v2: null,
  });
  assertEquals(v1Called, true);
  assertEquals(dual.v1, { ok: true });
  assertEquals(dual.v2, "skipped");
  assertEquals(REPLACE_RADAR_RPC, "replace_radar_v22_generation_v1");

  const isolated = await publishRadarV2IfNeeded({
    flagEnabled: true,
    result: {
      staleTransition: false,
      liveSurveillance: true,
      sessionReset: false,
      persistEmpty: false,
      sessionKind: "market",
      sessionTransition: null,
      persistenceV2: v2View([candidate("AAA")]),
    },
    gate: createRadarV2WriteGate(),
    wallNowMs: 0,
    checkpointMs: CHECKPOINT,
    generationId: GEN,
    syncedAt: SYNC,
    rpc: async () => {
      throw new Error("boom");
    },
  });
  assertEquals(isolated, { ok: false, code: "persist_failed" });
});

Deno.test("churn engine session transitions still force V2 persistence", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.pm, 80_000, 10, 16, 9), ET.pm);
  const pm = engine.evaluate(ET.pm + 50, GEN);
  const gate = createRadarV2WriteGate();
  const pmDecision = gate.decide({
    wallNowMs: ET.pm + 50,
    checkpointMs: CHECKPOINT,
    tradingDate: pm.persistenceV2.tradingDate,
    sessionKind: pm.persistenceV2.sessionKind,
    candidates: pm.persistenceV2.candidates,
    events: [],
    sessionTransition: pm.sessionTransition,
    sessionReset: pm.sessionReset,
  });
  assertEquals(pmDecision.shouldWrite, true);
  gate.markSuccess(pmDecision, ET.pm + 50);

  engine.ingest(aggRaw(ET.rthOpen, 1_000, 12, 12, 11), ET.rthOpen);
  const rth = engine.evaluate(ET.rthOpen, GEN);
  assertEquals(rth.sessionTransition, "soft_pm_rth");
  const rthDecision = gate.decide({
    wallNowMs: ET.rthOpen,
    checkpointMs: CHECKPOINT,
    tradingDate: rth.persistenceV2.tradingDate,
    sessionKind: rth.persistenceV2.sessionKind,
    candidates: rth.persistenceV2.candidates,
    events: [],
    sessionTransition: rth.sessionTransition,
    sessionReset: rth.sessionReset,
  });
  assertEquals(rthDecision.shouldWrite, true);
  assertEquals(rthDecision.reason, "session");
  gate.markSuccess(rthDecision, ET.rthOpen);

  engine.ingest(aggRaw(ET.firstAh, 1_000, 8, 8.5, 7.5), ET.firstAh);
  const ah = engine.evaluate(ET.firstAh, GEN);
  assertEquals(ah.sessionTransition, "soft_rth_ah");
  const ahDecision = gate.decide({
    wallNowMs: ET.firstAh,
    checkpointMs: CHECKPOINT,
    tradingDate: ah.persistenceV2.tradingDate,
    sessionKind: ah.persistenceV2.sessionKind,
    candidates: ah.persistenceV2.candidates,
    events: [],
    sessionTransition: ah.sessionTransition,
    sessionReset: ah.sessionReset,
  });
  assertEquals(ahDecision.shouldWrite, true);
  assertEquals(ahDecision.reason, "session");
  gate.markSuccess(ahDecision, ET.firstAh);

  const closed = engine.evaluate(ET.mon2000, GEN);
  assertEquals(closed.sessionTransition, "park_closed");
  const closedDecision = gate.decide({
    wallNowMs: ET.mon2000,
    checkpointMs: CHECKPOINT,
    tradingDate: closed.persistenceV2.tradingDate,
    sessionKind: closed.persistenceV2.sessionKind,
    candidates: closed.persistenceV2.candidates,
    events: [],
    sessionTransition: closed.sessionTransition,
    sessionReset: closed.sessionReset,
  });
  assertEquals(closedDecision.shouldWrite, true);
  assertEquals(closedDecision.reason, "session");
  gate.markSuccess(closedDecision, ET.mon2000);

  const reset = engine.evaluate(ET.tue0400, GEN);
  assertEquals(reset.sessionReset, true);
  const resetDecision = gate.decide({
    wallNowMs: ET.tue0400,
    checkpointMs: CHECKPOINT,
    tradingDate: reset.persistenceV2.tradingDate,
    sessionKind: reset.persistenceV2.sessionKind,
    candidates: reset.persistenceV2.candidates,
    events: [],
    sessionTransition: reset.sessionTransition,
    sessionReset: reset.sessionReset,
  });
  assertEquals(resetDecision.shouldWrite, true);
  assertEquals(resetDecision.reason, "session");
});
