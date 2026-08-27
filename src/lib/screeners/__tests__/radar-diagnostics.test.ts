import { describe, it, expect } from "vitest";
import {
  evaluateDayTradeRadar,
  formatRadarRejectionLog,
  preserveVolumeOrder,
  qualifiesDayTradeRadar,
  summarizeRadarDiagnostics,
} from "@/lib/screeners/radar-diagnostics";

const NOW = Date.parse("2026-08-27T14:00:00.000Z");
const UPDATED_NS = NOW * 1_000_000;

function ticker(partial: {
  ticker: string;
  price?: number;
  changePct?: number;
  volume?: number;
  prevVol?: number;
  prevClose?: number;
  updated?: number;
}) {
  const price = partial.price ?? 10;
  const prevClose = partial.prevClose ?? price / 1.15;
  return {
    ticker: partial.ticker,
    updated: partial.updated ?? UPDATED_NS,
    day: { c: price, v: partial.volume ?? 6_000_000 },
    prevDay: { c: prevClose, v: partial.prevVol ?? 1_000_000 },
  };
}

describe("day-trade radar diagnostics", () => {
  it("qualifies a candidate that meets every production prerequisite", () => {
    const t = ticker({ ticker: "ABCD", price: 8, volume: 6_000_000, prevVol: 1_000_000, prevClose: 7 });
    const d = evaluateDayTradeRadar(t, NOW);
    expect(qualifiesDayTradeRadar(t)).toBe(true);
    expect(d.qualified).toBe(true);
    expect(d.reasons).toEqual([]);
  });

  it("records each applicable rejection reason", () => {
    const missing = evaluateDayTradeRadar({ ticker: "ZZ", day: {}, prevDay: {} }, NOW);
    expect(missing.reasons).toContain("missing_invalid_snapshot");
    expect(missing.reasons).toContain("minimum_volume_failure");
    expect(missing.reasons).toContain("percentage_move_failure");
    expect(missing.reasons).toContain("volume_ratio_failure");

    const pricey = evaluateDayTradeRadar(ticker({ ticker: "EXP", price: 40, prevClose: 30 }), NOW);
    expect(pricey.reasons).toContain("price_range_failure");
    expect(pricey.qualified).toBe(false);
  });

  it("aggregates rejection counts without exposing payloads", () => {
    const diags = [
      evaluateDayTradeRadar(ticker({ ticker: "GOOD", price: 8, prevClose: 7 }), NOW),
      evaluateDayTradeRadar(ticker({ ticker: "HIGH", price: 50, prevClose: 40 }), NOW),
      evaluateDayTradeRadar({ ticker: "NONE" }, NOW),
    ];
    const summary = summarizeRadarDiagnostics(diags);
    expect(summary.evaluated).toBe(3);
    expect(summary.qualified).toBe(1);
    expect(summary.rejected).toBe(2);
    expect(summary.counts.price_range_failure).toBeGreaterThan(0);
    const log = formatRadarRejectionLog(summary);
    expect(log).toContain("evaluated=3");
    expect(log).not.toMatch(/apiKey|lastTrade|day\.c/);
  });

  it("does not reorder volume-first rows during enrichment", () => {
    const rows = [
      { symbol: "A", volume: 9 },
      { symbol: "B", volume: 3 },
    ];
    expect(preserveVolumeOrder(rows).map((r) => r.symbol)).toEqual(["A", "B"]);
  });

  it("treats a legitimate empty qualified set as empty, not an error", () => {
    const diags = [
      evaluateDayTradeRadar(ticker({ ticker: "SLOW", price: 8, prevClose: 7.9, volume: 100, prevVol: 100 }), NOW),
    ];
    const summary = summarizeRadarDiagnostics(diags);
    expect(summary.qualified).toBe(0);
    expect(summary.rejected).toBe(1);
  });

  it("rejects a candidate without a verifiable provider as-of timestamp", () => {
    const d = evaluateDayTradeRadar({ ...ticker({ ticker: "ABCD" }), updated: 0 }, NOW);
    expect(d.qualified).toBe(false);
    expect(d.reasons).toContain("missing_invalid_snapshot");
  });
});
