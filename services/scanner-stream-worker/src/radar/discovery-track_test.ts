import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  discoveryTrackPrefilter,
  effectiveDiscoveryTrackCap,
  pennyPanelPriceEligible,
  rankDiscoveryCandidates,
} from "./discovery-track.ts";
import { mergeRadarConfig } from "./config.ts";
import type { SentinelMetrics } from "./types.ts";

const config = mergeRadarConfig({ sentinelEnabled: true, promotionCap: 128 });

function metrics(over: Partial<SentinelMetrics> = {}): SentinelMetrics {
  return {
    symbol: "X",
    lastStartMs: 0,
    lastVolume: 1,
    lastDollarVolume: 1,
    sessionVolume: 1,
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
    dollarVol60s: 50_000,
    lastEndMs: 1_000_000,
    lastClose: 0.85,
    ...over,
  };
}

Deno.test("pennyPanelPriceEligible matches under-$1 band", () => {
  assertEquals(pennyPanelPriceEligible(0.99), true);
  assertEquals(pennyPanelPriceEligible(1), false);
});

Deno.test("effectiveDiscoveryTrackCap stays within global 200 ceiling", () => {
  assertEquals(effectiveDiscoveryTrackCap(config), 48);
  const tight = mergeRadarConfig({ promotionCap: 180 });
  assertEquals(effectiveDiscoveryTrackCap(tight), 20);
});

Deno.test("discoveryTrackPrefilter requires sentinel promotion pass", () => {
  const weak = metrics({
    vol5s: 0,
    vol15s: 0,
    vol60s: 0,
    dollarVol5s: 0,
    dollarVol15s: 0,
    dollarVol60s: 0,
  });
  assertEquals(
    discoveryTrackPrefilter(weak, null, config),
    false,
  );
});

Deno.test("rankDiscoveryCandidates orders by dollar volume", () => {
  const ranked = rankDiscoveryCandidates([
    { symbol: "B", score: 100, lastEndMs: 1 },
    { symbol: "A", score: 500, lastEndMs: 2 },
  ]);
  assertEquals(ranked.map((r) => r.symbol), ["A", "B"]);
});
