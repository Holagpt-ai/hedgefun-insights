import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCREENER_TAB_ID } from "@/config/screener-tabs.config";
import { applyScreenerFilters } from "@/lib/screeners/filters";
import { compareCandidatesVolumeFirst } from "@/lib/screeners/radar-v2-adapter";
import {
  ACTIVE_SCREENER_FILTER_FIELDS,
  DORMANT_SCREENER_FILTER_LABELS,
  EMPTY_SCREENER_FILTER_DRAFT,
  applyScreenerRowFilters,
  countActiveScreenerFilters,
  screenerFilterSetFromDraft,
  toScreenerFilterCandidate,
} from "@/lib/screeners/screener-filters";

function row(
  symbol: string,
  overrides: Partial<{
    price: number | null;
    volume: number | null;
    rvol_20d: number | null;
    change_percent: number | null;
    gap_percent: number | null;
  }> = {},
) {
  return {
    symbol,
    tab_id: "gappers",
    price: overrides.price === undefined ? 10 : overrides.price,
    volume: overrides.volume === undefined ? 1_000_000 : overrides.volume,
    rvol_20d: overrides.rvol_20d === undefined ? 3 : overrides.rvol_20d,
    change_percent: overrides.change_percent === undefined ? 12 : overrides.change_percent,
    gap_percent: overrides.gap_percent === undefined ? null : overrides.gap_percent,
    provider_as_of: "2026-09-21T14:00:00.000Z",
    updated_at: "2026-09-21T14:05:00.000Z",
  };
}

function draft(overrides: Partial<typeof EMPTY_SCREENER_FILTER_DRAFT> = {}) {
  return { ...EMPTY_SCREENER_FILTER_DRAFT, ...overrides };
}

describe("Screener Filters V1 adapter", () => {
  it("1. numeric GTE keeps only rows at or above the threshold", () => {
    const rows = [row("LOW", { volume: 100_000 }), row("HIGH", { volume: 2_000_000 })];
    const passed = applyScreenerRowFilters(
      rows,
      screenerFilterSetFromDraft(draft({ minVolume: "1000000" })),
    );
    expect(passed.map((item) => item.symbol)).toEqual(["HIGH"]);
  });

  it("2. numeric LTE keeps only rows at or below the threshold", () => {
    const rows = [row("IN", { price: 8 }), row("OUT", { price: 25 })];
    const passed = applyScreenerRowFilters(
      rows,
      screenerFilterSetFromDraft(draft({ maxPrice: "20" })),
    );
    expect(passed.map((item) => item.symbol)).toEqual(["IN"]);
  });

  it("3. BETWEEN uses both price bounds", () => {
    const rows = [
      row("LOW", { price: 1 }),
      row("IN", { price: 8 }),
      row("HIGH", { price: 30 }),
    ];
    const passed = applyScreenerRowFilters(
      rows,
      screenerFilterSetFromDraft(draft({ minPrice: "2", maxPrice: "20" })),
    );
    expect(passed.map((item) => item.symbol)).toEqual(["IN"]);
  });

  it("4. multiple filters use AND", () => {
    const rows = [
      row("BOTH", { price: 10, volume: 5_000_000, change_percent: 15, rvol_20d: 6 }),
      row("PRICE_ONLY", { price: 10, volume: 10_000, change_percent: 15, rvol_20d: 6 }),
      row("VOL_ONLY", { price: 1, volume: 5_000_000, change_percent: 15, rvol_20d: 6 }),
    ];
    const passed = applyScreenerRowFilters(
      rows,
      screenerFilterSetFromDraft(draft({ minPrice: "5", minVolume: "1000000" })),
    );
    expect(passed.map((item) => item.symbol)).toEqual(["BOTH"]);
  });

  it("5. missing required value is DATA_UNAVAILABLE", () => {
    const candidate = toScreenerFilterCandidate(row("A", { rvol_20d: null }), 1);
    const evaluation = applyScreenerFilters(
      [candidate],
      screenerFilterSetFromDraft(draft({ minRvol20d: "2" })),
    );
    expect(evaluation.passed).toEqual([]);
    expect(evaluation.evaluations[0]?.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("6. stale DQ value is not filterable", () => {
    const candidate = toScreenerFilterCandidate(row("A", { price: 10 }), 1, {
      freshnessState: "STALE",
    });
    expect(candidate.price).toBeNull();
    const evaluation = applyScreenerFilters(
      [candidate],
      screenerFilterSetFromDraft(draft({ minPrice: "1" })),
    );
    expect(evaluation.evaluations[0]?.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("7. invalid value is not filterable", () => {
    const candidate = toScreenerFilterCandidate(row("A", { price: Number.NaN }), 1);
    expect(candidate.price).toBeNull();
    const evaluation = applyScreenerFilters(
      [candidate],
      screenerFilterSetFromDraft(draft({ minPrice: "1" })),
    );
    expect(evaluation.evaluations[0]?.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("8. null is not treated as zero", () => {
    const candidate = toScreenerFilterCandidate(row("A", { volume: null }), 1);
    expect(candidate.currentSessionVolume).toBeNull();
    const evaluation = applyScreenerFilters(
      [candidate],
      screenerFilterSetFromDraft(draft({ minVolume: "0" })),
    );
    expect(evaluation.passed).toEqual([]);
    expect(evaluation.evaluations[0]?.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("9. valid zero is preserved and can pass", () => {
    const candidate = toScreenerFilterCandidate(row("A", { volume: 0, rvol_20d: 0 }), 1);
    expect(candidate.currentSessionVolume).toBe(0);
    expect(candidate.rvol20d).toBe(0);
    const passed = applyScreenerRowFilters(
      [row("A", { volume: 0, rvol_20d: 0 })],
      screenerFilterSetFromDraft(draft({ minVolume: "0", minRvol20d: "0" })),
    );
    expect(passed.map((item) => item.symbol)).toEqual(["A"]);
  });

  it("10/11. filtered rows keep original Discovery ranks and incoming order", () => {
    const rows = [
      row("ABC", { price: 10 }),
      row("XYZ", { price: 1 }),
      row("DEF", { price: 1 }),
      row("LMN", { price: 12 }),
    ];
    const passed = applyScreenerRowFilters(
      rows,
      screenerFilterSetFromDraft(draft({ minPrice: "5" })),
      (_row, index) => index + 1,
    );
    expect(passed.map((item) => item.symbol)).toEqual(["ABC", "LMN"]);
    const candidates = passed.map((item, index) =>
      toScreenerFilterCandidate(item, rows.findIndex((rowItem) => rowItem.symbol === item.symbol) + 1),
    );
    expect(candidates.map((item) => item.discoveryRank)).toEqual([1, 4]);
  });

  it("13. active filter count matches filled inputs", () => {
    expect(countActiveScreenerFilters(EMPTY_SCREENER_FILTER_DRAFT)).toBe(0);
    expect(countActiveScreenerFilters(draft({ minPrice: "2", maxPrice: "20", minVolume: "1000" }))).toBe(3);
    expect(countActiveScreenerFilters(draft({ minPrice: "abc" }))).toBe(0);
  });

  it("15. does not expose or fabricate dormant filter values", () => {
    const candidate = toScreenerFilterCandidate(row("A"), 1);
    expect(candidate.float).toBeUndefined();
    expect(candidate.floatTurnover).toBeUndefined();
    expect(candidate.spreadPct).toBeUndefined();
    expect(candidate.catalystQuality).toBeUndefined();
    expect(candidate.tradeQualityScore).toBeUndefined();
    expect(candidate.vwapState).toBeUndefined();
    expect(DORMANT_SCREENER_FILTER_LABELS).toEqual(expect.arrayContaining(["Float", "Trade Quality", "Catalyst"]));
    expect([...ACTIVE_SCREENER_FILTER_FIELDS]).toEqual([
      "price",
      "currentSessionVolume",
      "dollarVolume",
      "movePct",
      "rvol20d",
    ]);
  });

  it("16. compareCandidatesVolumeFirst source is untouched", () => {
    const src = readFileSync(resolve("src/lib/screeners/radar-v2-adapter.ts"), "utf8");
    expect(src).toContain("export function compareCandidatesVolumeFirst(");
    expect(src).toContain("d = descKey(b.session_volume) - descKey(a.session_volume)");
    expect(src).not.toMatch(/applyScreenerFilters|screenerFilterSetFromDraft/);
    expect(compareCandidatesVolumeFirst(
      { symbol: "AAA", session_volume: 5, volume_60s: 1, dollar_volume_60s: 1 } as never,
      { symbol: "BBB", session_volume: 1, volume_60s: 9, dollar_volume_60s: 9 } as never,
    )).toBeLessThan(0);
  });

  it("17. default screener sort remains Discovery / tab order", () => {
    expect(DEFAULT_SCREENER_TAB_ID).toBe("day_trade_radar");
    const rows = [row("AAA", { volume: 100 }), row("BBB", { volume: 9_000_000 })];
    const passed = applyScreenerRowFilters(rows, screenerFilterSetFromDraft(EMPTY_SCREENER_FILTER_DRAFT));
    expect(passed.map((item) => item.symbol)).toEqual(["AAA", "BBB"]);
  });

  it("incomplete Trade Quality is not a filterable score", () => {
    const candidate = toScreenerFilterCandidate(row("A"), 1);
    expect(candidate.tradeQualityScore).toBeUndefined();
    const evaluation = applyScreenerFilters(
      [candidate],
      {
        id: "tq",
        combinator: "AND",
        filters: [{ id: "min-tq", field: "tradeQualityScore", operator: "GTE", value: 70 }],
      },
    );
    expect(evaluation.evaluations[0]?.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });
});
