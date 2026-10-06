import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RADAR_V22_CONFIG } from "./config.ts";
import { compareRankedCandidates, rankBoard } from "./rank.ts";
import type { RankedCandidate } from "./types.ts";

function candidate(over: Partial<RankedCandidate>): RankedCandidate {
  return {
    symbol: "AAA",
    lifecycle: "ACTIVE",
    vol5s: 1_000,
    vol15s: 2_000,
    vol60s: 50_000,
    dollarVol60s: 100_000,
    sessionVolume: 200_000,
    acceleration5m: 1,
    freshnessAgeMs: 1_000,
    lastPrice: 8,
    changePercent: 12,
    priorVolume: 100_000,
    volumeRatio: 2,
    dayHigh: 8.2,
    dayLow: 7.1,
    sessionVwap: 7.6,
    peakVol15: 2_000,
    companyName: null,
    providerAsOfMs: 1,
    ...over,
  };
}

Deno.test("volume is king: liquid tape outranks a thin name with hotter acceleration", () => {
  const liquid = candidate({
    symbol: "LIQ",
    vol60s: 2_000_000,
    vol15s: 400_000,
    vol5s: 80_000,
    acceleration5m: 5,
  });
  const thin = candidate({
    symbol: "THIN",
    vol60s: 40_000,
    vol15s: 8_000,
    vol5s: 2_000,
    acceleration5m: 900,
    sessionVolume: 40_000,
  });
  assertEquals(compareRankedCandidates(liquid, thin, RADAR_V22_CONFIG) < 0, true);
  const ranked = rankBoard([thin, liquid], RADAR_V22_CONFIG);
  assertEquals(ranked[0]?.symbol, "LIQ");
});
