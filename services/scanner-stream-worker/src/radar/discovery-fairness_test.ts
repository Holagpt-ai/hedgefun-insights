import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createRadarEngine } from "./engine.ts";
import { mergeRadarConfig } from "./config.ts";
import {
  rankDiscoveryCandidates,
  scoreDiscoveryCandidate,
} from "./discovery-track.ts";
import type { EligibleQuote, SentinelMetrics } from "./types.ts";

const T0 = Date.parse("2026-08-10T14:00:00.000Z");
const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function metrics(
  symbol: string,
  dollar60: number,
  lastClose: number,
): SentinelMetrics {
  return {
    symbol,
    lastStartMs: 0,
    lastVolume: 1,
    lastDollarVolume: 1,
    sessionVolume: dollar60,
    lastSeenMs: 0,
    observedSeconds: 60,
    precedingVol5Baseline: 0,
    precedingSeconds5: 30,
    expected5: null,
    precedingVol15Baseline: 0,
    precedingSeconds15: 30,
    expected15: null,
    vol5s: 20_000,
    vol15s: 30_000,
    vol60s: 120_000,
    dollarVol5s: 5_000,
    dollarVol15s: 10_000,
    dollarVol60s: dollar60,
    lastEndMs: 1_000_000,
    lastClose,
  };
}

Deno.test("cap-full discovery pool ranks by dollar60 — large-cap high-$ volume wins slots", () => {
  const cap = 3;
  const ranked = rankDiscoveryCandidates([
    { symbol: "PENNY", score: scoreDiscoveryCandidate(metrics("PENNY", 50_000, 0.5)), lastEndMs: 1 },
    { symbol: "BRK", score: scoreDiscoveryCandidate(metrics("BRK", 900_000, 12)), lastEndMs: 2 },
    { symbol: "MEGA", score: scoreDiscoveryCandidate(metrics("MEGA", 5_000_000, 80)), lastEndMs: 3 },
    { symbol: "MID", score: scoreDiscoveryCandidate(metrics("MID", 400_000, 25)), lastEndMs: 4 },
  ]);
  const kept = ranked.slice(0, cap).map((r) => r.symbol);
  assertEquals(kept, ["MEGA", "BRK", "MID"]);
  assertEquals(kept.includes("PENNY"), false);
});

Deno.test("penny mover earns discovery slot when dollar60 beats cap incumbents", () => {
  const ranked = rankDiscoveryCandidates([
    { symbol: "PENNY", score: scoreDiscoveryCandidate(metrics("PENNY", 2_000_000, 0.6)), lastEndMs: 1 },
    { symbol: "BRK", score: scoreDiscoveryCandidate(metrics("BRK", 900_000, 12)), lastEndMs: 2 },
    { symbol: "MID", score: scoreDiscoveryCandidate(metrics("MID", 400_000, 25)), lastEndMs: 3 },
  ]);
  assertEquals(ranked[0]?.symbol, "PENNY");
});

function agg(sym: string, s: number, v: number, c: number): Record<string, unknown> {
  return {
    ev: "A",
    sym,
    v,
    av: v * 20,
    op: c,
    vw: c,
    o: c,
    c,
    h: c,
    l: c,
    a: c,
    z: 10,
    s,
    e: s + 1_000,
  };
}

function quote(symbol: string, price: number): EligibleQuote {
  return {
    symbol,
    companyName: symbol,
    regularClose: price,
    previousClose: price * 0.8,
    dayVolume: 2_000_000,
    priorVolume: 500_000,
    dayHigh: price * 1.1,
    dayLow: price * 0.8,
    volumeRatio: 4,
    changePercent: 20,
  };
}

Deno.test("engine cap-full discovery keeps highest dollar60 movers — no category quota", () => {
  const engine = createRadarEngine({
    config: mergeRadarConfig({
      sentinelEnabled: true,
      promotionCap: 1,
      discoveryTrackCap: 1,
    }),
    exceptions: [],
  });
  engine.setUniverse(new Map([
    ["MAIN", quote("MAIN", 50)],
    ["MEGA", quote("MEGA", 80)],
    ["PENNY", quote("PENNY", 0.5)],
  ]));
  for (let i = 0; i < 70; i++) {
    const s = T0 + i * 1_000;
    engine.ingest(agg("MAIN", s, 50_000, 50), s);
    engine.ingest(agg("MEGA", s, 35_000, 80), s);
    engine.ingest(agg("PENNY", s, 35_000, 0.5), s);
  }
  engine.evaluate(T0 + 80_000, GEN);
  assertEquals(engine.isPromoted("MAIN"), true);
  assertEquals(engine.isDiscoveryTracked("MEGA"), true);
  assertEquals(engine.isDiscoveryTracked("PENNY"), false);
});
