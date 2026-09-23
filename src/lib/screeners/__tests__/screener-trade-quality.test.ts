import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRADE_QUALITY_COMPONENT_WEIGHTS,
  TRADE_QUALITY_MIN_COVERAGE_PCT,
  TRADE_QUALITY_TOTAL_WEIGHT,
} from "@/config/trade-quality.config";
import { DEFAULT_SCREENER_TAB_ID, SCREENER_TABS } from "@/config/screener-tabs.config";
import {
  createAuthoritativeValue,
  createDiscrepancyValue,
  createInvalidValue,
  createPartialValue,
} from "@/lib/screeners/data-quality";
import { compareCandidatesVolumeFirst } from "@/lib/screeners/radar-v2-adapter";
import { toScreenerDollarVolumeValue } from "@/lib/screeners/screener-data-quality";
import {
  calculateScreenerTradeQuality,
  evaluateScreenerTradeQuality,
  formatScreenerTradeQuality,
  formatScreenerTradeQualityFromRow,
  toScreenerTradeQualityView,
  type ScreenerTradeQualityValues,
} from "@/lib/screeners/screener-trade-quality";
import { calculateTradeQuality } from "@/lib/screeners/trade-quality";
import type { TradeQualityCatalystQuality, TradeQualityTechnicalInput } from "@/types/trade-quality";

const FRESH = { freshnessState: "FRESH" as const };

const PERFECT_TECHNICAL: TradeQualityTechnicalInput = {
  aboveVwap: "TRUE",
  holdingVwapAfterReclaim: "TRUE",
  nearHod: "TRUE",
  higherHighHigherLow: "TRUE",
  positiveMomentum: "TRUE",
};

function usableNumber(value: number, metric: "price" | "volume" | "rvol20d" | "movePct" | "float") {
  return createAuthoritativeValue(value, { metric, ...FRESH });
}

function fullUsableValues(): ScreenerTradeQualityValues {
  return {
    price: usableNumber(10, "price"),
    volume: usableNumber(10_000_000, "volume"),
    dollarVolume: toScreenerDollarVolumeValue(10, 10_000_000, FRESH),
    movePct: usableNumber(25, "movePct"),
    rvol20d: usableNumber(12, "rvol20d"),
    bid: usableNumber(9.99, "price"),
    ask: usableNumber(10.01, "price"),
    publicFloat: usableNumber(1_000_000, "float"),
    catalystQuality: createAuthoritativeValue<TradeQualityCatalystQuality>("STRONG", FRESH),
    technical: createAuthoritativeValue(PERFECT_TECHNICAL, FRESH),
  };
}

function productionRow() {
  return {
    price: 10,
    volume: 10_000_000,
    rvol_20d: 5,
    change_percent: 12,
    gap_percent: null,
    provider_as_of: "2026-09-21T14:00:00.000Z",
    updated_at: "2026-09-21T14:05:00.000Z",
  };
}

describe("Screener Trade Quality adapter", () => {
  it("1. full usable inputs produce a valid score matching the foundation", () => {
    const adapter = calculateScreenerTradeQuality(fullUsableValues());
    const foundation = calculateTradeQuality({
      price: 10,
      currentSessionVolume: 10_000_000,
      absoluteMovePct: 25,
      catalystQuality: "STRONG",
      bid: 9.99,
      ask: 10.01,
      technical: PERFECT_TECHNICAL,
      publicFloat: 1_000_000,
      rvol20d: 12,
    });
    expect(adapter.score).toBe(100);
    expect(adapter.score).toBe(foundation.score);
    expect(adapter.label).toBe("HIGH_QUALITY");
    expect(adapter.coveragePct).toBe(100);
    expect(adapter.availableWeight).toBe(TRADE_QUALITY_TOTAL_WEIGHT);
  });

  it("2. weighted calculation matches foundation", () => {
    const values = fullUsableValues();
    values.catalystQuality = createAuthoritativeValue<TradeQualityCatalystQuality>("MODERATE", FRESH);
    values.rvol20d = usableNumber(3, "rvol20d");
    const adapter = calculateScreenerTradeQuality(values);
    const foundation = calculateTradeQuality({
      price: 10,
      currentSessionVolume: 10_000_000,
      absoluteMovePct: 25,
      catalystQuality: "MODERATE",
      bid: 9.99,
      ask: 10.01,
      technical: PERFECT_TECHNICAL,
      publicFloat: 1_000_000,
      rvol20d: 3,
    });
    expect(adapter.score).toBe(foundation.score);
    expect(adapter.earnedPoints).toBe(foundation.earnedPoints);
    expect(adapter.availableWeight).toBe(foundation.availableWeight);
  });

  it("3. normalization uses available weight, not total weight", () => {
    const adapter = calculateScreenerTradeQuality({
      price: usableNumber(10, "price"),
      volume: usableNumber(50_000_000, "volume"),
      dollarVolume: toScreenerDollarVolumeValue(10, 50_000_000, FRESH),
      movePct: usableNumber(20, "movePct"),
      rvol20d: createAuthoritativeValue(Number.NaN, { metric: "rvol20d", ...FRESH }),
      catalystQuality: createAuthoritativeValue<TradeQualityCatalystQuality>("STRONG", FRESH),
    });
    expect(adapter.availableWeight).toBe(25 + 15 + 15 + 5);
    expect(adapter.coveragePct).toBe(TRADE_QUALITY_MIN_COVERAGE_PCT);
    expect(adapter.score).not.toBeNull();
    expect(adapter.score).toBe(
      calculateTradeQuality({
        price: 10,
        currentSessionVolume: 50_000_000,
        absoluteMovePct: 20,
        catalystQuality: "STRONG",
      }).score,
    );
  });

  it("4. coverage below 60% is INCOMPLETE", () => {
    const view = evaluateScreenerTradeQuality(productionRow());
    expect(view.coverage).toBeLessThan(TRADE_QUALITY_MIN_COVERAGE_PCT);
    expect(view.coverage).toBe(50);
    expect(view.status).toBe("INCOMPLETE");
    expect(view.score).toBeNull();
    expect(view.result.score).toBeNull();
  });

  it("5. missing inputs are not treated as zero", () => {
    const view = evaluateScreenerTradeQuality(productionRow());
    expect(view.result.components.catalyst).toMatchObject({ available: false, score: null });
    expect(view.result.components.spread).toMatchObject({ available: false, score: null });
    expect(view.result.components.technical).toMatchObject({ available: false, score: null });
    expect(view.result.components.floatTurnover).toMatchObject({ available: false, score: null });
    expect(view.missingComponents).toEqual(
      expect.arrayContaining(["catalyst", "spread", "technical", "floatTurnover"]),
    );
    expect(view.usableWeight).toBe(50);
    expect(view.totalWeight).toBe(TRADE_QUALITY_TOTAL_WEIGHT);
  });

  it("6. stale input is excluded from the score", () => {
    const values = fullUsableValues();
    values.rvol20d = createAuthoritativeValue(12, { metric: "rvol20d", freshnessState: "STALE" });
    const result = calculateScreenerTradeQuality(values);
    expect(result.components.rvol20d).toMatchObject({ available: false, score: null });
    expect(result.availableWeight).toBe(TRADE_QUALITY_TOTAL_WEIGHT - TRADE_QUALITY_COMPONENT_WEIGHTS.rvol20d);
    expect(result.score).not.toBeNull();
  });

  it("7. partial and discrepancy inputs are excluded from the score", () => {
    const partial = fullUsableValues();
    partial.movePct = createPartialValue(25, { metric: "movePct", ...FRESH });
    const partialResult = calculateScreenerTradeQuality(partial);
    expect(partialResult.components.movement).toMatchObject({ available: false, score: null });

    const discrepancy = fullUsableValues();
    discrepancy.rvol20d = createDiscrepancyValue(12, { metric: "rvol20d", ...FRESH });
    const discrepancyResult = calculateScreenerTradeQuality(discrepancy);
    expect(discrepancyResult.components.rvol20d).toMatchObject({ available: false, score: null });
  });

  it("8. invalid input is excluded from the score", () => {
    const values = fullUsableValues();
    values.rvol20d = createInvalidValue({ metric: "rvol20d", ...FRESH });
    const result = calculateScreenerTradeQuality(values);
    expect(result.components.rvol20d).toMatchObject({ available: false, score: null });
    expect(result.availableWeight).toBe(TRADE_QUALITY_TOTAL_WEIGHT - TRADE_QUALITY_COMPONENT_WEIGHTS.rvol20d);
  });

  it("9. valid zero input remains valid", () => {
    const values = fullUsableValues();
    values.rvol20d = usableNumber(0, "rvol20d");
    values.catalystQuality = createAuthoritativeValue<TradeQualityCatalystQuality>("NONE", FRESH);
    const result = calculateScreenerTradeQuality(values);
    expect(result.components.rvol20d).toMatchObject({ available: true, rawValue: 0, score: 0 });
    expect(result.components.catalyst).toMatchObject({ available: true, score: 0 });
    expect(result.score).not.toBeNull();
  });

  it("10. component contributions sum to earned points", () => {
    const result = calculateScreenerTradeQuality(fullUsableValues());
    let earned = 0;
    for (const key of Object.keys(TRADE_QUALITY_COMPONENT_WEIGHTS) as Array<
      keyof typeof TRADE_QUALITY_COMPONENT_WEIGHTS
    >) {
      const component = result.components[key];
      if (!component.available || component.score === null) continue;
      earned += (component.score / component.maxScore) * TRADE_QUALITY_COMPONENT_WEIGHTS[key];
    }
    expect(result.earnedPoints).toBeCloseTo(earned, 3);
    expect(result.earnedPoints).toBe(TRADE_QUALITY_TOTAL_WEIGHT);
  });

  it("11. Discovery order remains volume-first", () => {
    const highVolume = {
      symbol: "LOWTQ",
      session_volume: 8_000_000,
      volume_60s: 1,
      dollar_volume_60s: 1,
    };
    const lowVolume = {
      symbol: "HIGHTQ",
      session_volume: 1_000_000,
      volume_60s: 9,
      dollar_volume_60s: 9_000_000,
    };
    expect(compareCandidatesVolumeFirst(highVolume as never, lowVolume as never)).toBeLessThan(0);
  });

  it("12. compareCandidatesVolumeFirst source is untouched", () => {
    const src = readFileSync(resolve("src/lib/screeners/radar-v2-adapter.ts"), "utf8");
    expect(src).toContain("export function compareCandidatesVolumeFirst(");
    expect(src).toContain("d = descKey(b.session_volume) - descKey(a.session_volume)");
    expect(src).not.toMatch(/tradeQuality|trade_quality|calculateTradeQuality/);
  });

  it("13. default screener sort remains Triggered time", () => {
    expect(DEFAULT_SCREENER_TAB_ID).toBe("day_trade_radar");
    for (const tab of SCREENER_TABS) {
      expect(tab.columns[0]).toMatchObject({ key: "trigger_time", format: "trigger_time" });
      const rvolIndex = tab.columns.findIndex((column) => column.key === "rvol_20d");
      const tqIndex = tab.columns.findIndex((column) => column.key === "trade_quality");
      expect(rvolIndex).toBeGreaterThan(-1);
      expect(tqIndex).toBe(rvolIndex + 1);
    }
  });

  it("15. incomplete Trade Quality does not fabricate a score", () => {
    const view = toScreenerTradeQualityView(calculateScreenerTradeQuality({
      price: usableNumber(10, "price"),
      volume: usableNumber(10_000_000, "volume"),
      dollarVolume: toScreenerDollarVolumeValue(10, 10_000_000, FRESH),
      movePct: usableNumber(12, "movePct"),
      rvol20d: usableNumber(5, "rvol20d"),
    }));
    expect(view.status).toBe("INCOMPLETE");
    expect(view.score).toBeNull();
    expect(formatScreenerTradeQuality(view)).toBe("—");
    expect(formatScreenerTradeQualityFromRow(productionRow())).toBe("—");
    expect(formatScreenerTradeQuality(view)).not.toMatch(/BUY|SELL|STRONG|WEAK|HIGH_QUALITY|INCOMPLETE/);
  });

  it("aging authoritative inputs remain usable for scoring", () => {
    const values = fullUsableValues();
    values.rvol20d = createAuthoritativeValue(12, { metric: "rvol20d", freshnessState: "AGING" });
    const result = calculateScreenerTradeQuality(values);
    expect(result.components.rvol20d.available).toBe(true);
    expect(result.score).toBe(100);
  });
});
