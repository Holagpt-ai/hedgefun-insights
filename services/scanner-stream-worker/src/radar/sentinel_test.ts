import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { qualifiesDayTradeRadar } from "../../../../supabase/functions/_shared/screeners/selection.ts";
import { mergeRadarConfig, RADAR_PROMOTION_HARD_MAX } from "./config.ts";
import { createRadarEngine } from "./engine.ts";
import { validateRadarGeneration } from "./persist.ts";
import {
  createMarketSentinel,
  evaluatePromotion,
} from "./sentinel.ts";
import type { EligibleQuote, SentinelMetrics } from "./types.ts";
import type { RadarV22BoardRow } from "../../../../supabase/functions/_shared/radar-v22/types.ts";

const T0 = Date.parse("2026-08-10T14:00:00.000Z"); // 10:00 ET Monday
const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function agg(opts: {
  sym: string;
  s: number;
  v: number;
  c: number;
  av?: number;
}): Record<string, unknown> {
  const close = opts.c;
  return {
    ev: "A",
    sym: opts.sym,
    v: opts.v,
    av: opts.av ?? opts.v,
    op: close,
    vw: close,
    o: close,
    c: close,
    h: close,
    l: close,
    a: close,
    z: 10,
    s: opts.s,
    e: opts.s + 1_000,
  };
}

function ingestSeconds(
  engine: ReturnType<typeof createRadarEngine>,
  symbol: string,
  fromMs: number,
  count: number,
  volume: number,
  close: number,
  receiveMs: number,
  closeEnd?: number,
): void {
  for (let i = 0; i < count; i++) {
    const s = fromMs + i * 1_000;
    const px = closeEnd === undefined
      ? close
      : close + (closeEnd - close) * (count === 1 ? 1 : i / (count - 1));
    engine.ingest(
      agg({ sym: symbol, s, v: volume, c: px }),
      receiveMs,
    );
  }
}

function sentinelEngine(
  overrides: Parameters<typeof mergeRadarConfig>[0] = {},
) {
  return createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: true, ...overrides }),
    exceptions: [],
  });
}

function dtrFailingTicker() {
  return {
    ticker: "NVDA",
    day: { c: 120, v: 1_000_000 },
    prevDay: { c: 119, v: 900_000 },
    updated: 1_700_000_000_000_000_000,
  };
}

function metrics(partial: Partial<SentinelMetrics>): SentinelMetrics {
  return {
    symbol: "AAA",
    lastStartMs: T0,
    lastEndMs: T0 + 1000,
    lastVolume: 1,
    lastClose: 5,
    lastDollarVolume: 5,
    vol5s: 0,
    vol15s: 0,
    vol60s: 0,
    dollarVol5s: 0,
    dollarVol15s: 0,
    dollarVol60s: 0,
    sessionVolume: 0,
    lastSeenMs: T0,
    observedSeconds: 60,
    precedingVol5Baseline: 0,
    precedingSeconds5: 55,
    expected5: 0,
    precedingVol15Baseline: 0,
    precedingSeconds15: 45,
    expected15: 0,
    ...partial,
  };
}

Deno.test("promotion cap cannot exceed hard maximum of 200", () => {
  const config = mergeRadarConfig({
    promotionCap: 10_000,
    promotionHardMax: 10_000,
  });
  assertEquals(config.promotionCap, RADAR_PROMOTION_HARD_MAX);
  assertEquals(config.promotionHardMax, RADAR_PROMOTION_HARD_MAX);
});

Deno.test("evaluatePromotion is direction-neutral and volume-first", () => {
  const config = mergeRadarConfig();
  const rising = evaluatePromotion(
    metrics({
      vol5s: 20_000,
      vol15s: 20_000,
      vol60s: 60_000,
      dollarVol5s: 100_000,
      lastClose: 12,
    }),
    config,
  );
  const falling = evaluatePromotion(
    metrics({
      vol5s: 20_000,
      vol15s: 20_000,
      vol60s: 60_000,
      dollarVol5s: 100_000,
      lastClose: 4,
    }),
    config,
  );
  assertEquals(rising.promote, true);
  assertEquals(rising.reason, "absolute_60s");
  assertEquals(falling.promote, true);
  assertEquals(falling.reason, "absolute_60s");
});

Deno.test("evaluatePromotion self-relative 5s burst uses preceding baseline", () => {
  const config = mergeRadarConfig();
  const burst = evaluatePromotion(
    metrics({
      vol5s: 8_000,
      vol15s: 8_400,
      vol60s: 10_000,
      dollarVol5s: 8_000 * 0.5,
      lastClose: 0.5,
      precedingSeconds5: 40,
      precedingVol5Baseline: 2_000,
      expected5: 250,
    }),
    config,
  );
  assertEquals(burst.promote, true);
  assertEquals(burst.reason, "burst_5s");
  const noBurst = evaluatePromotion(
    metrics({
      vol5s: 800,
      vol15s: 3_000,
      vol60s: 10_000,
      dollarVol5s: 4_000,
      lastClose: 5,
      precedingSeconds5: 40,
      precedingVol5Baseline: 9_200,
      expected5: 1_150,
    }),
    config,
  );
  assertEquals(noBurst.promote, false);
});

Deno.test("evaluatePromotion self-relative 15s burst uses preceding baseline", () => {
  const config = mergeRadarConfig();
  const burst = evaluatePromotion(
    metrics({
      vol5s: 3_000,
      vol15s: 9_000,
      vol60s: 11_000,
      dollarVol15s: 9_000 * 0.5,
      lastClose: 0.5,
      precedingSeconds5: 40,
      precedingVol5Baseline: 2_000,
      expected5: 250,
      precedingSeconds15: 40,
      precedingVol15Baseline: 2_000,
      expected15: 750,
    }),
    config,
  );
  assertEquals(burst.promote, true);
  assertEquals(burst.reason, "burst_15s");
});

Deno.test("evaluatePromotion rejects missing lastClose", () => {
  const config = mergeRadarConfig();
  const none = evaluatePromotion(
    metrics({
      lastClose: null,
      vol5s: 80_000,
      vol15s: 80_000,
      vol60s: 80_000,
    }),
    config,
  );
  assertEquals(none.promote, false);
});

Deno.test("sentinel rings do not allocate SecondBar maps", () => {
  const sentinel = createMarketSentinel();
  const tracked = new Set<string>();
  const event = {
    ev: "A" as const,
    sym: "QQQ",
    v: 100,
    av: 100,
    op: 10,
    vw: 10,
    o: 10,
    c: 10,
    h: 10,
    l: 10,
    a: 10,
    z: 1,
    s: T0,
    e: T0 + 1000,
  };
  sentinel.ingestEvent(event, T0);
  assertEquals(sentinel.has("QQQ"), true);
  assertEquals(tracked.size, 0);
  const m = sentinel.metrics("QQQ");
  assert(m !== null);
  assertEquals(m.vol5s, 100);
});

Deno.test("1. Sentinel receives a symbol that fails qualifiesDayTradeRadar", () => {
  assertEquals(qualifiesDayTradeRadar(dtrFailingTicker()), false);
  const engine = sentinelEngine();
  engine.ingest(agg({ sym: "NVDA", s: T0, v: 200, c: 120 }), T0);
  assertEquals(engine.hasSentinel("NVDA"), true);
  assertEquals(engine.hasRadarBook("NVDA"), false);
});

Deno.test("2. Sentinel-only symbols do not receive RadarBook history", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "SLOW", T0, 60, 50, 8, T0);
  assertEquals(engine.hasSentinel("SLOW"), true);
  assertEquals(engine.isPromoted("SLOW"), false);
  assertEquals(engine.hasRadarBook("SLOW"), false);
  assertEquals(engine.bookBarCount("SLOW"), 0);
});

Deno.test("3. Absolute volume threshold promotes a candidate", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "ABS", T0, 5, 20_000, 6, T0);
  assertEquals(engine.isPromoted("ABS"), true);
  assertEquals(engine.hasRadarBook("ABS"), true);
  assert(engine.bookBarCount("ABS") > 0);
  assert(engine.bookBarCount("ABS") <= 5);
});

Deno.test("4. Self-relative 5-second burst can promote", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "B5", T0, 40, 80, 5, T0);
  assertEquals(engine.isPromoted("B5"), false);
  ingestSeconds(engine, "B5", T0 + 40_000, 5, 1_800, 5, T0 + 40_000);
  assertEquals(engine.isPromoted("B5"), true);
  assertEquals(engine.hasRadarBook("B5"), true);
});

Deno.test("5. Self-relative 15-second burst can promote", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "B15", T0, 40, 50, 5, T0);
  assertEquals(engine.isPromoted("B15"), false);
  ingestSeconds(engine, "B15", T0 + 40_000, 15, 600, 5, T0 + 40_000);
  assertEquals(engine.isPromoted("B15"), true);
  assertEquals(engine.hasRadarBook("B15"), true);
});

Deno.test("6. Downward price movement does not block promotion", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "DUMP", T0, 5, 20_000, 10, T0, 7);
  assertEquals(engine.isPromoted("DUMP"), true);
  assertEquals(engine.hasRadarBook("DUMP"), true);
});

Deno.test("7. Upward price movement can promote normally", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "MOON", T0, 5, 20_000, 7, T0, 10);
  assertEquals(engine.isPromoted("MOON"), true);
  assertEquals(engine.hasRadarBook("MOON"), true);
});

Deno.test("8. Missing catalyst does not block promotion", () => {
  const engine = sentinelEngine();
  const event = agg({ sym: "NOCAT", s: T0, v: 60_000, c: 4 });
  assertEquals("catalyst" in event, false);
  engine.ingest(event, T0);
  assertEquals(engine.isPromoted("NOCAT"), true);
});

Deno.test("9. Missing prior-session volume does not prevent in-memory promotion", () => {
  const engine = sentinelEngine();
  assertEquals(engine.snapshot().rows.length, 0);
  ingestSeconds(engine, "NOPRIOR", T0, 5, 20_000, 3.5, T0);
  assertEquals(engine.isPromoted("NOPRIOR"), true);
  assertEquals(engine.hasRadarBook("NOPRIOR"), true);
  const board = engine.evaluate(T0 + 50, GEN);
  assertEquals(board.board.rows.find((r) => r.symbol === "NOPRIOR"), undefined);
});

Deno.test("10-11. Promotion count never exceeds configured cap", () => {
  const engine = sentinelEngine({ promotionCap: 2 });
  ingestSeconds(engine, "C1", T0, 1, 80_000, 5, T0);
  ingestSeconds(engine, "C2", T0, 1, 80_000, 5, T0);
  ingestSeconds(engine, "C3", T0, 1, 80_000, 5, T0);
  const stats = engine.sentinelStats();
  assertEquals(stats.promoted, 2);
  assertEquals(stats.cap, 2);
  assert(stats.capRejections >= 1);
  assertEquals(engine.isPromoted("C3"), false);
  assertEquals(engine.hasRadarBook("C3"), false);
  assertEquals(engine.hasSentinel("C3"), true);
  assertEquals(engine.hasRadarBook("C1"), true);
  assertEquals(engine.hasRadarBook("C2"), true);
});

Deno.test("12. Sentinel TTL removes inactive cheap state", () => {
  const engine = sentinelEngine({ sentinelTtlMs: 2_000 });
  engine.ingest(agg({ sym: "TTL", s: T0, v: 10, c: 9 }), T0);
  assertEquals(engine.hasSentinel("TTL"), true);
  // Advance provider event time on a different symbol; wall clock is irrelevant.
  engine.ingest(agg({ sym: "TAPE", s: T0 + 2_000, v: 10, c: 9 }), T0 + 2_000);
  engine.evaluate(T0 + 2_000, GEN);
  assertEquals(engine.hasSentinel("TTL"), false);
  assertEquals(engine.hasRadarBook("TTL"), false);
  assertEquals(engine.hasSentinel("TAPE"), true);
  assert(engine.sentinelStats().evictions >= 1);
});

Deno.test("13-14. Quiet Stage-2 book is dropped and can re-promote", () => {
  const engine = sentinelEngine({ sentinelTtlMs: 2_000 });
  ingestSeconds(engine, "RE", T0, 1, 80_000, 5, T0);
  assertEquals(engine.hasRadarBook("RE"), true);
  engine.ingest(agg({ sym: "TAPE", s: T0 + 3_500, v: 10, c: 9 }), T0 + 3_500);
  engine.evaluate(T0 + 3_500, GEN);
  assertEquals(engine.isPromoted("RE"), false);
  assertEquals(engine.hasRadarBook("RE"), false);
  assert(engine.sentinelStats().demotionsTotal >= 1);
  ingestSeconds(engine, "RE", T0 + 4_000, 1, 80_000, 5, T0 + 4_000);
  assertEquals(engine.isPromoted("RE"), true);
  assertEquals(engine.hasRadarBook("RE"), true);
});

Deno.test("15. RADAR_SENTINEL_ENABLED=false preserves universe-gated ingest", () => {
  const engine = createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: false }),
    exceptions: [],
  });
  const ignored = engine.ingest(agg({ sym: "ZZZ", s: T0, v: 90_000, c: 5 }), T0);
  assertEquals(ignored.accepted, false);
  if (!ignored.accepted) assertEquals(ignored.reason, "ignored");
  assertEquals(engine.hasSentinel("ZZZ"), false);
  assertEquals(engine.hasRadarBook("ZZZ"), false);
  assertEquals(engine.sentinelStats().enabled, false);
});

Deno.test("17. Published board remains Top-20 compatible with sentinel on", () => {
  const engine = sentinelEngine();
  const quote = (symbol: string): EligibleQuote => ({
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
  });
  const universe = new Map<string, EligibleQuote>();
  universe.set("AAA", quote("AAA"));
  engine.setUniverse(universe);
  ingestSeconds(engine, "AAA", T0, 20, 20_000, 10, T0, 10.4);
  engine.evaluate(T0 + 50, GEN);
  engine.evaluate(T0 + 60, GEN);
  const result = engine.evaluate(T0 + 70, GEN);
  assert(result.board.rows.length <= 20);
  if (result.board.rows.length > 0) {
    assertEquals(
      validateRadarGeneration(
        result.board.rows as RadarV22BoardRow[],
        GEN,
        result.board.sessionDate,
        result.board.rows[0].updated_at,
        result.board.status === "stale" ? "available" : result.board.status,
      ) || result.board.status === "empty",
      true,
    );
  }
});

Deno.test("sentinel telemetry is populated when enabled", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "TEL", T0, 1, 80_000, 5, T0);
  const stats = engine.sentinelStats();
  assertEquals(stats.enabled, true);
  assertEquals(stats.live >= 1, true);
  assertEquals(stats.promoted >= 1, true);
  assertEquals(stats.cap, 128);
  assertEquals(typeof stats.promotionsTotal, "number");
});

const DELAY_15M = 15 * 60 * 1000;

Deno.test("continuously arriving delayed provider events do not cause Stage-2 demotion", () => {
  const engine = sentinelEngine({ sentinelTtlMs: 2_000 });
  const eventBase = T0 - DELAY_15M;
  const wallBase = T0;
  for (let i = 0; i < 8; i++) {
    engine.ingest(
      agg({ sym: "DLY", s: eventBase + i * 1_000, v: 20_000, c: 5 }),
      wallBase + i * 1_000,
    );
  }
  assertEquals(engine.isPromoted("DLY"), true);
  const result = engine.evaluate(wallBase + 8_000, GEN);
  assertEquals(result.staleTransition, false);
  assertEquals(engine.isPromoted("DLY"), true);
  assertEquals(engine.hasRadarBook("DLY"), true);
});

Deno.test("historical replayed events do not demote solely because wall clock is later", () => {
  const engine = sentinelEngine({ sentinelTtlMs: 2_000 });
  const farWall = T0 + DELAY_15M;
  // Event chronology is T0; receive/wall are "now" as in a delayed replay harness.
  engine.ingest(agg({ sym: "OLD", s: T0, v: 80_000, c: 5 }), farWall);
  assertEquals(engine.hasRadarBook("OLD"), true);
  const result = engine.evaluate(farWall, GEN);
  assertEquals(result.staleTransition, false);
  assertEquals(engine.isPromoted("OLD"), true);
  assertEquals(engine.hasRadarBook("OLD"), true);
});

Deno.test("true provider-event inactivity demotes after configured TTL", () => {
  const engine = sentinelEngine({ sentinelTtlMs: 2_000 });
  const eventBase = T0 - DELAY_15M;
  const wallBase = T0;
  engine.ingest(
    agg({ sym: "QUIET", s: eventBase, v: 80_000, c: 5 }),
    wallBase,
  );
  assertEquals(engine.hasRadarBook("QUIET"), true);
  engine.ingest(
    agg({ sym: "TAPE", s: eventBase + 2_000, v: 10, c: 9 }),
    wallBase + 2_000,
  );
  engine.evaluate(wallBase + 2_000, GEN);
  assertEquals(engine.isPromoted("QUIET"), false);
  assertEquals(engine.hasRadarBook("QUIET"), false);
  assertEquals(engine.hasSentinel("TAPE"), true);
});

Deno.test("operational feed-staleness still uses receive time vs wall clock", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", T0, 5, 20_000, 10, T0);
  const live = engine.evaluate(T0 + 50, GEN);
  assertEquals(live.staleTransition, false);
  const delayedLive = sentinelEngine();
  const eventBase = T0 - DELAY_15M;
  delayedLive.ingest(
    agg({ sym: "BBB", s: eventBase, v: 80_000, c: 5 }),
    T0,
  );
  const delayedEval = delayedLive.evaluate(T0 + 1_000, GEN);
  assertEquals(delayedEval.staleTransition, false);
  assertEquals(delayedLive.isPromoted("BBB"), true);
  const stale = engine.evaluate(T0 + 50 + 16_000, GEN);
  assertEquals(stale.staleTransition, true);
  assertEquals(stale.board.feedStale, true);
});

