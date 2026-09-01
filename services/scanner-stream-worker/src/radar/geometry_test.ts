import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeRadarConfig } from "./config.ts";
import { createRadarBook } from "./bars.ts";
import { createRadarEngine } from "./engine.ts";
import {
  createSessionIntelBook,
  dollarContribution,
  freshnessClassAt,
} from "./geometry.ts";
import { emptyLifecycle, stepLifecycle } from "./lifecycle.ts";
import { REPLACE_RADAR_RPC } from "./persist.ts";
import { rankBoard } from "./rank.ts";
import { RADAR_PROMOTION_CAP_DEFAULT, RADAR_PROMOTION_HARD_MAX } from "./config.ts";
import type { AggregateSecondEvent, EligibleQuote, RankedCandidate } from "./types.ts";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DELAY = 15 * 60 * 1000;

const ET = {
  pm: Date.parse("2026-08-10T12:30:00.000Z"), // 08:30 ET
  rthOpen: Date.parse("2026-08-10T13:30:00.000Z"), // 09:30
  rthMid: Date.parse("2026-08-10T14:47:00.000Z"), // 10:47
  lastRth: Date.parse("2026-08-10T19:59:59.000Z"), // 15:59:59
  firstAh: Date.parse("2026-08-10T20:00:00.000Z"), // 16:00:00
  ah: Date.parse("2026-08-10T20:30:00.000Z"),
  tue0400: Date.parse("2026-08-11T08:00:00.000Z"),
};

function event(opts: {
  sym?: string;
  s: number;
  v?: number;
  c: number;
  h?: number;
  l?: number;
  o?: number;
  vw?: number;
  a?: number;
}): AggregateSecondEvent {
  const c = opts.c;
  const h = opts.h ?? c;
  const l = opts.l ?? c;
  const o = opts.o ?? c;
  const vw = opts.vw ?? c;
  const v = opts.v ?? 1_000;
  return {
    ev: "A",
    sym: opts.sym ?? "AAA",
    v,
    av: v,
    op: o,
    vw,
    o,
    c,
    h,
    l,
    a: opts.a ?? null,
    z: 10,
    s: opts.s,
    e: opts.s + 1_000,
  };
}

function hints(volume: number) {
  return {
    vol5s: volume,
    vol15s: volume,
    vol60s: volume,
    move15s: { movePct: 0, complete: true } as const,
    move60s: { movePct: 0, complete: true } as const,
    acceleration5m: null as number | null,
  };
}

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

function aggRaw(s: number, v: number, c: number, h = c, l = c): Record<string, unknown> {
  return {
    ev: "A",
    sym: "AAA",
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

Deno.test("5-7. session attribution uses bar start s, not end e", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const intel = createSessionIntelBook(config);
  intel.applyEvent(event({ s: ET.lastRth, c: 11, h: 11.5, v: 5_000 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  let snap = intel.get("AAA", ET.lastRth + 1_000)!;
  assertEquals(snap.sessionKind, "market");
  assertEquals(snap.sessionHigh, 11.5);

  intel.softResetAll("after-hours", 1);
  intel.applyEvent(event({ s: ET.firstAh, c: 12, h: 12.2, v: 5_000 }), {
    currentKind: "after-hours",
    subsessionEpoch: 1,
    exceptions: [],
    hints: hints(20_000),
  });
  snap = intel.get("AAA", ET.firstAh + 1_000)!;
  assertEquals(snap.sessionKind, "after-hours");
  assertEquals(snap.sessionHigh, 12.2);
  assertEquals(snap.frozenPrior?.sessionKind, "market");
  assertEquals(snap.frozenPrior?.sessionHigh, 11.5);
});

Deno.test("1-4. PM HOD/VWAP are independent of RTH; RTH independent of AH", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const intel = createSessionIntelBook(config);
  intel.applyEvent(event({ s: ET.pm, c: 10, h: 15, l: 9, v: 2_000, vw: 10 }), {
    currentKind: "pre-market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  const pm = intel.get("AAA", ET.pm + 1_000)!;
  assertEquals(pm.sessionHigh, 15);
  assertEquals(pm.sessionVwap, 10);

  intel.softResetAll("market", 1);
  intel.applyEvent(event({ s: ET.rthOpen, c: 20, h: 21, l: 19, v: 4_000, vw: 20 }), {
    currentKind: "market",
    subsessionEpoch: 1,
    exceptions: [],
    hints: hints(20_000),
  });
  const rth = intel.get("AAA", ET.rthOpen + 1_000)!;
  assertEquals(rth.sessionHigh, 21);
  assertEquals(rth.sessionLow, 19);
  assertEquals(rth.sessionVwap, 20);
  assertEquals(rth.frozenPrior?.sessionHigh, 15);
  assertEquals(rth.frozenPrior?.sessionVwap, 10);

  intel.softResetAll("after-hours", 2);
  intel.applyEvent(event({ s: ET.ah, c: 8, h: 9, l: 7, v: 1_000, vw: 8 }), {
    currentKind: "after-hours",
    subsessionEpoch: 2,
    exceptions: [],
    hints: hints(20_000),
  });
  const ah = intel.get("AAA", ET.ah + 1_000)!;
  assertEquals(ah.sessionHigh, 9);
  assertEquals(ah.sessionVwap, 8);
  assertEquals(ah.frozenPrior?.sessionHigh, 21);
  assertEquals(ah.frozenPrior?.sessionVwap, 20);
});

Deno.test("8-9. HOD and LOD survive six-minute bar pruning", () => {
  const config = mergeRadarConfig({ barRetentionMs: 3_000 });
  const book = createRadarBook(config);
  const tracked = new Set(["AAA"]);
  book.ingest(aggRaw(ET.rthOpen, 1_000, 10, 18, 9), ET.rthOpen, tracked);
  for (let i = 1; i <= 8; i++) {
    book.ingest(
      aggRaw(ET.rthOpen + i * 1_000, 1_000, 10, 11, 10),
      ET.rthOpen + i * 1_000,
      tracked,
    );
  }
  const metrics = book.metrics("AAA", ET.rthOpen + 8_000, null)!;
  assertEquals(metrics.sessionHigh, 18);
  assertEquals(metrics.sessionLow, 9);
  assert(metrics.barCount < 8);

  const intel = createSessionIntelBook(mergeRadarConfig({ sentinelEnabled: true }));
  intel.applyEvent(event({ s: ET.rthOpen, c: 10, h: 18, l: 9 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  for (let i = 1; i <= 400; i++) {
    intel.applyEvent(event({ s: ET.rthOpen + i * 1_000, c: 10, h: 11, l: 10 }), {
      currentKind: "market",
      subsessionEpoch: 0,
      exceptions: [],
      hints: hints(20_000),
    });
  }
  const snap = intel.get("AAA", ET.rthOpen + 400_000)!;
  assertEquals(snap.sessionHigh, 18);
  assertEquals(snap.sessionLow, 9);
});

Deno.test("10-13. new HOD, attempt, break, and rejection", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const intel = createSessionIntelBook(config);
  const s0 = ET.rthOpen;
  intel.applyEvent(event({ s: s0, c: 10, h: 10, v: 20_000 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  let snap = intel.get("AAA", s0 + 1_000)!;
  assertEquals(snap.lastNewHodMs, s0);
  assertEquals(snap.lastHodBreakMs, null);

  intel.applyEvent(event({ s: s0 + 1_000, c: 10, h: 10, v: 20_000 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  snap = intel.get("AAA", s0 + 2_000)!;
  assertEquals(snap.lastNewHodMs, s0);

  intel.applyEvent(
    event({ s: s0 + 2_000, c: 9.99, h: 9.99, v: 20_000 }),
    {
      currentKind: "market",
      subsessionEpoch: 0,
      exceptions: [],
      hints: hints(20_000),
    },
  );
  snap = intel.get("AAA", s0 + 3_000)!;
  assertEquals(snap.lastHodAttemptMs, s0 + 2_000);

  intel.applyEvent(
    event({ s: s0 + 3_000, c: 10.2, h: 10.3, v: 20_000 }),
    {
      currentKind: "market",
      subsessionEpoch: 0,
      exceptions: [],
      hints: hints(20_000),
    },
  );
  snap = intel.get("AAA", s0 + 4_000)!;
  assertEquals(snap.lastNewHodMs, s0 + 3_000);
  assertEquals(snap.lastHodBreakMs, s0 + 3_000);
  assertEquals(snap.sessionHigh, 10.3);

  intel.applyEvent(
    event({ s: s0 + 4_000, c: 10.29, h: 10.3, v: 20_000 }),
    {
      currentKind: "market",
      subsessionEpoch: 0,
      exceptions: [],
      hints: hints(20_000),
    },
  );
  snap = intel.get("AAA", s0 + 5_000)!;
  assertEquals(snap.lastHodBreakMs, s0 + 3_000);

  intel.applyEvent(
    event({ s: s0 + 5_000, c: 10.2, h: 10.22, v: 1 }),
    {
      currentKind: "market",
      subsessionEpoch: 0,
      exceptions: [],
      hints: hints(1),
    },
  );
  snap = intel.get("AAA", s0 + 6_000)!;
  assertEquals(snap.lastHodRejectMs, s0 + 5_000);
});

Deno.test("14-17. VWAP above/below, reclaim and loss clock once", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const intel = createSessionIntelBook(config);
  const s0 = ET.rthOpen;
  intel.applyEvent(event({ s: s0, c: 10, v: 1_000, vw: 10 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(1_000),
  });
  intel.applyEvent(event({ s: s0 + 1_000, c: 12, v: 1_000, vw: 12 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(1_000),
  });
  let snap = intel.get("AAA", s0 + 2_000)!;
  assertEquals(snap.vwapSide, "above");
  assertEquals(snap.lastVwapReclaimMs, null);

  intel.applyEvent(event({ s: s0 + 2_000, c: 8, v: 1_000, vw: 8 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(1_000),
  });
  snap = intel.get("AAA", s0 + 3_000)!;
  assertEquals(snap.vwapSide, "below");
  assertEquals(snap.lastVwapLossMs, s0 + 2_000);
  const lossAt = snap.lastVwapLossMs;

  intel.applyEvent(event({ s: s0 + 3_000, c: 7, v: 1_000, vw: 7 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(1_000),
  });
  snap = intel.get("AAA", s0 + 4_000)!;
  assertEquals(snap.lastVwapLossMs, lossAt);

  intel.applyEvent(event({ s: s0 + 4_000, c: 20, v: 1_000, vw: 20 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(1_000),
  });
  snap = intel.get("AAA", s0 + 5_000)!;
  assertEquals(snap.vwapSide, "above");
  assertEquals(snap.lastVwapReclaimMs, s0 + 4_000);
  const reclaimAt = snap.lastVwapReclaimMs;
  intel.applyEvent(event({ s: s0 + 5_000, c: 21, v: 1_000, vw: 21 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(1_000),
  });
  snap = intel.get("AAA", s0 + 6_000)!;
  assertEquals(snap.lastVwapReclaimMs, reclaimAt);
  assertEquals(dollarContribution(event({ s: s0, c: 10, v: 2, vw: 5 })), 10);
});

Deno.test("18-19. mid-session promotion marks VWAP and geometry partial", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const intel = createSessionIntelBook(config);
  intel.applyEvent(event({ s: ET.rthMid, c: 10, v: 1_000 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  const snap = intel.get("AAA", ET.rthMid + 1_000)!;
  assertEquals(snap.geometryPartial, true);
  assertEquals(snap.vwapPartial, true);

  const fromOpen = createSessionIntelBook(config);
  fromOpen.applyEvent(event({ s: ET.rthOpen, c: 10, v: 1_000 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  const openSnap = fromOpen.get("AAA", ET.rthOpen + 1_000)!;
  assertEquals(openSnap.geometryPartial, false);
  assertEquals(openSnap.vwapPartial, false);
});

Deno.test("23-26. freshness clocks: burst, up, down, acceleration only when valid", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const intel = createSessionIntelBook(config);
  const s0 = ET.rthOpen;
  intel.applyEvent(event({ s: s0, c: 10, v: 1 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: {
      vol5s: 20_000,
      vol15s: 20_000,
      vol60s: 20_000,
      move15s: { movePct: 0, complete: true },
      move60s: { movePct: 0, complete: true },
      acceleration5m: null,
    },
  });
  let snap = intel.get("AAA", s0 + 1_000)!;
  assertEquals(snap.lastVolumeBurstMs, s0);
  assertEquals(snap.lastPriceMoveMs, null);
  assertEquals(snap.lastAccelerationMs, null);

  intel.applyEvent(event({ s: s0 + 1_000, c: 10.1, v: 1 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: {
      vol5s: 1,
      vol15s: 1,
      vol60s: 1,
      move15s: { movePct: 0.4, complete: true },
      move60s: { movePct: 0, complete: false },
      acceleration5m: 1.5,
    },
  });
  snap = intel.get("AAA", s0 + 2_000)!;
  assertEquals(snap.lastPriceMoveMs, s0 + 1_000);
  assertEquals(snap.lastAccelerationMs, null);

  intel.applyEvent(event({ s: s0 + 2_000, c: 9.9, v: 1 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: {
      vol5s: 1,
      vol15s: 1,
      vol60s: 1,
      move15s: { movePct: -0.4, complete: true },
      move60s: { movePct: 0, complete: false },
      acceleration5m: 2.5,
    },
  });
  snap = intel.get("AAA", s0 + 3_000)!;
  assertEquals(snap.lastPriceMoveMs, s0 + 2_000);
  assertEquals(snap.lastAccelerationMs, s0 + 2_000);
});

Deno.test("27-30. freshness class boundaries", () => {
  const config = mergeRadarConfig();
  assertEquals(freshnessClassAt(0, config), "fresh");
  assertEquals(freshnessClassAt(30_000, config), "fresh");
  assertEquals(freshnessClassAt(30_001, config), "active");
  assertEquals(freshnessClassAt(120_000, config), "active");
  assertEquals(freshnessClassAt(120_001, config), "cooling");
  assertEquals(freshnessClassAt(480_000, config), "cooling");
  assertEquals(freshnessClassAt(480_001, config), "stale");
  assertEquals(freshnessClassAt(null, config), "unknown");
});

Deno.test("31-33. freshness uses event time; delayed/replay wall does not stale", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.rthOpen, 80_000, 10), ET.rthOpen + DELAY);
  const delayed = engine.evaluate(ET.rthOpen + DELAY + 50, GEN);
  assertEquals(delayed.staleTransition, false);
  const delayedGeo = engine.sessionIntel("AAA")!;
  assertEquals(delayedGeo.freshnessClass, "fresh");
  assert(delayedGeo.freshnessAgeMs !== null && delayedGeo.freshnessAgeMs <= 30_000);

  const replay = sentinelEngine();
  replay.ingest(aggRaw(ET.rthOpen, 80_000, 10), ET.rthOpen);
  replay.evaluate(ET.rthOpen + 50, GEN);
  replay.ingest(aggRaw(ET.rthOpen + 5_000, 1_000, 10.1), ET.rthOpen + 5_000);
  const replayed = replay.evaluate(ET.rthOpen + 5_050, GEN);
  assertEquals(replayed.staleTransition, false);
  const replayGeo = replay.sessionIntel("AAA")!;
  assertEquals(replayGeo.freshnessClass, "fresh");
});

Deno.test("20-22. engine 04:00 hard reset and soft transitions reset geometry", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.pm, 80_000, 10, 16, 9), ET.pm);
  engine.evaluate(ET.pm + 50, GEN);
  assertEquals(engine.isPromoted("AAA"), true);
  let geo = engine.sessionIntel("AAA")!;
  assertEquals(geo.sessionKind, "pre-market");
  assertEquals(geo.sessionHigh, 16);

  engine.ingest(aggRaw(ET.rthOpen, 1_000, 12, 12, 11), ET.rthOpen);
  const rth = engine.evaluate(ET.rthOpen, GEN);
  assertEquals(rth.sessionTransition, "soft_pm_rth");
  assertEquals(engine.isPromoted("AAA"), true);
  geo = engine.sessionIntel("AAA")!;
  assertEquals(geo.sessionKind, "market");
  assertEquals(geo.sessionHigh, 12);
  assertEquals(geo.frozenPrior?.sessionHigh, 16);
  assertEquals(geo.subsessionEpoch >= 1, true);

  engine.ingest(aggRaw(ET.firstAh, 1_000, 8, 8.5, 7.5), ET.firstAh);
  const ah = engine.evaluate(ET.firstAh, GEN);
  assertEquals(ah.sessionTransition, "soft_rth_ah");
  geo = engine.sessionIntel("AAA")!;
  assertEquals(geo.sessionKind, "after-hours");
  assertEquals(geo.sessionHigh, 8.5);
  assertEquals(geo.frozenPrior?.sessionHigh, 12);

  const reset = engine.evaluate(ET.tue0400, GEN);
  assertEquals(reset.sessionReset, true);
  assertEquals(engine.sessionIntel("AAA"), null);
  assertEquals(engine.isPromoted("AAA"), false);
});

Deno.test("34-35. lifecycle cooling duration is event time, not wall", () => {
  const config = mergeRadarConfig({
    archiveCoolingMs: 5_000,
    archiveLowActivityEvals: 1,
  });
  const metrics = {
    symbol: "AAA",
    vol5s: 100,
    vol15s: 100,
    vol60s: 100,
    dollarVol60s: 1,
    sessionVolume: 1,
    sessionHigh: 11,
    sessionLow: 9,
    sessionVwap: 10,
    lastPrice: 10,
    move15s: { movePct: -1, complete: true },
    move60s: { movePct: -1, complete: true },
    acceleration5m: null,
    providerLagMs: 0,
    lastBarEndMs: ET.rthOpen,
    lastBarStartMs: ET.rthOpen - 1000,
    lateCorrectionInWindows: false,
    barCount: 20,
  };
  let rec = emptyLifecycle("2026-08-10");
  rec = {
    ...rec,
    phase: "ACTIVE",
    consecutiveActiveFail: 3,
    peakVol15WhileActive: 40_000,
  };
  rec = stepLifecycle(rec, {
    sessionDate: "2026-08-10",
    eventNowMs: ET.rthOpen,
    wallNowMs: ET.rthOpen + DELAY,
    detect: false,
    active: false,
    metrics,
    lateBlocksNewSignal: false,
    config,
  }).record;
  assertEquals(rec.phase, "COOLING");
  assertEquals(rec.coolingEnteredAtMs, ET.rthOpen);

  const stillCooling = stepLifecycle(rec, {
    sessionDate: "2026-08-10",
    eventNowMs: ET.rthOpen + 1_000,
    wallNowMs: ET.rthOpen + DELAY + 60_000,
    detect: false,
    active: false,
    metrics,
    lateBlocksNewSignal: false,
    config,
  }).record;
  assertEquals(stillCooling.phase, "COOLING");

  const archived = stepLifecycle(stillCooling, {
    sessionDate: "2026-08-10",
    eventNowMs: ET.rthOpen + 6_000,
    wallNowMs: ET.rthOpen + DELAY + 120_000,
    detect: false,
    active: false,
    metrics,
    lateBlocksNewSignal: false,
    config,
  });
  assertEquals(archived.record.phase, "ARCHIVED");
});

Deno.test("36. global feed stale remains wall vs receive time", () => {
  const engine = sentinelEngine();
  engine.ingest(aggRaw(ET.rthOpen, 80_000, 10), ET.rthOpen);
  const live = engine.evaluate(ET.rthOpen + 50, GEN);
  assertEquals(live.staleTransition, false);
  const stale = engine.evaluate(ET.rthOpen + 50 + 16_000, GEN);
  assertEquals(stale.staleTransition, true);
});

Deno.test("37-38. sentinel promotion cap unchanged", () => {
  assertEquals(RADAR_PROMOTION_CAP_DEFAULT, 128);
  assertEquals(RADAR_PROMOTION_HARD_MAX, 200);
  const config = mergeRadarConfig({ promotionCap: 10_000 });
  assertEquals(config.promotionCap, 200);
});

Deno.test("39. legacy flag-off does not run extended-hours geometry", () => {
  const engine = createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: false }),
    exceptions: [],
  });
  engine.setUniverse(new Map([["AAA", quote("AAA")]]));
  engine.ingest(aggRaw(ET.pm, 80_000, 10), ET.pm);
  const pm = engine.evaluate(ET.pm + 50, GEN);
  assertEquals(pm.published, false);
  assertEquals(engine.sessionIntel("AAA"), null);
});

Deno.test("40. persistence RPC name unchanged", () => {
  assertEquals(REPLACE_RADAR_RPC, "replace_radar_v22_generation_v1");
});

Deno.test("sentinel ranking does not let dead session volume beat live tape", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const live: RankedCandidate = {
    symbol: "LIVE",
    lifecycle: "DETECTED",
    vol5s: 20_000,
    vol15s: 40_000,
    vol60s: 120_000,
    dollarVol60s: 100,
    sessionVolume: 1,
    acceleration5m: null,
    freshnessAgeMs: 1_000,
    lastPrice: 10,
    changePercent: 1,
    priorVolume: 1,
    volumeRatio: 1,
    dayHigh: 11,
    dayLow: 9,
    sessionVwap: 10,
    peakVol15: 40_000,
    companyName: null,
    providerAsOfMs: ET.rthOpen,
  };
  const dead: RankedCandidate = {
    ...live,
    symbol: "DEAD",
    sessionVolume: 9e9,
    freshnessAgeMs: 600_000,
  };
  const ranked = rankBoard([dead, live], config);
  assertEquals(ranked[0].symbol, "LIVE");
});

Deno.test("late RTH bar with e=16:00 is ignored after AH reset", () => {
  const config = mergeRadarConfig({ sentinelEnabled: true });
  const intel = createSessionIntelBook(config);
  intel.applyEvent(event({ s: ET.lastRth, c: 10, h: 11 }), {
    currentKind: "market",
    subsessionEpoch: 0,
    exceptions: [],
    hints: hints(20_000),
  });
  intel.softResetAll("after-hours", 1);
  intel.applyEvent(event({ s: ET.lastRth, c: 50, h: 50 }), {
    currentKind: "after-hours",
    subsessionEpoch: 1,
    exceptions: [],
    hints: hints(20_000),
  });
  const snap = intel.get("AAA", ET.firstAh)!;
  assertEquals(snap.sessionHigh, null);
  assertEquals(snap.frozenPrior?.sessionHigh, 11);
});
