import { describe, expect, it } from "vitest";
import { qualifiesDayTradeRadar, type RadarQuote } from "@/lib/screeners/radar-diagnostics";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import { WATCHLIST_SNAPSHOT_STALE_MS } from "@/lib/market-data/trust-states";

function quote(dayClose: number, prevClose: number, dayVol: number, prevVol: number): RadarQuote {
  return { day: { c: dayClose, v: dayVol }, prevDay: { c: prevClose, v: prevVol } };
}

describe("scanner ranking and day-trade gates stay in place", () => {
  it("keeps the 45-minute watchlist snapshot contract", () => {
    expect(WATCHLIST_SNAPSHOT_STALE_MS).toBe(45 * 60_000);
  });

  it("keeps the classic day-trade gate", () => {
    expect(qualifiesDayTradeRadar(quote(8, 7, 500_000, 50_000))).toBe(true);
    expect(qualifiesDayTradeRadar(quote(1.5, 1, 500_000, 50_000))).toBe(false);
    expect(qualifiesDayTradeRadar(quote(21, 18, 500_000, 50_000))).toBe(false);
    expect(qualifiesDayTradeRadar(quote(8, 7.5, 500_000, 50_000))).toBe(false);
    expect(qualifiesDayTradeRadar(quote(8, 7, 200_000, 50_000))).toBe(false);
  });

  it("still ranks higher session volume first", () => {
    const low = { symbol: "LOW", session_volume: 1_000 } as RadarV2CandidateRow;
    const high = { symbol: "HIGH", session_volume: 9_000 } as RadarV2CandidateRow;
    expect(compareCandidatesVolumeFirst(low, high)).toBeGreaterThan(0);
  });
});
