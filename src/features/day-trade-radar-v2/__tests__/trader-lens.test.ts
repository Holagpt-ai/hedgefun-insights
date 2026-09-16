import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import {
  DEFAULT_TRADER_LENS_PRESET_ID,
  TRADER_LENS_PRESETS,
  getTraderLensPreset,
  parseTraderLensPriceInput,
  resolveTraderLensBounds,
} from "@/config/scanner-presets.config";
import { rankRadarRows } from "../radar-metrics";
import {
  INITIAL_RADAR_SELECTION,
  radarSelectionReducer,
} from "../radar-selection";
import {
  applyTraderLensPriceFilter,
  matchesTraderLensPrice,
  traderLensShowingCopy,
} from "../trader-lens";

function row(
  overrides: Partial<ScreenerResultRow> & Pick<ScreenerResultRow, "symbol" | "volume">,
): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.company_name ?? overrides.symbol,
    price: overrides.price ?? 10,
    change_percent: overrides.change_percent ?? null,
    volume: overrides.volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: overrides.day_high ?? 11,
    day_low: overrides.day_low ?? 9,
    provider_as_of: overrides.provider_as_of ?? "2026-09-16T15:00:00.000Z",
    sync_run_id: overrides.sync_run_id ?? "11111111-1111-4111-8111-111111111111",
    updated_at: overrides.updated_at ?? "2026-09-16T15:05:00.000Z",
    ...overrides,
  };
}

describe("Trader Lens price presets", () => {
  it("keeps All Movers as the default and does not hardwire $2–$20", () => {
    expect(DEFAULT_TRADER_LENS_PRESET_ID).toBe("all_movers");
    expect(getTraderLensPreset("all_movers")).toEqual({
      id: "all_movers",
      label: "All Movers",
      min: null,
      max: null,
    });
    expect(getTraderLensPreset("momentum_2_20")).toEqual({
      id: "momentum_2_20",
      label: "$2–$20 Momentum",
      min: 2,
      max: 20,
    });
    expect(TRADER_LENS_PRESETS).toHaveLength(6);
  });

  it("applies inclusive $2–$20 Momentum boundaries", () => {
    const bounds = resolveTraderLensBounds("momentum_2_20", null, null);
    expect(matchesTraderLensPrice(2, bounds)).toBe(true);
    expect(matchesTraderLensPrice(20, bounds)).toBe(true);
    expect(matchesTraderLensPrice(1.99, bounds)).toBe(false);
    expect(matchesTraderLensPrice(20.01, bounds)).toBe(false);
  });

  it("applies the other named price presets", () => {
    expect(matchesTraderLensPrice(1, resolveTraderLensBounds("band_1_10", null, null))).toBe(true);
    expect(matchesTraderLensPrice(10, resolveTraderLensBounds("band_1_10", null, null))).toBe(true);
    expect(matchesTraderLensPrice(0.99, resolveTraderLensBounds("band_1_10", null, null))).toBe(false);
    expect(matchesTraderLensPrice(5, resolveTraderLensBounds("band_5_20", null, null))).toBe(true);
    expect(matchesTraderLensPrice(4.99, resolveTraderLensBounds("band_5_20", null, null))).toBe(false);
    expect(matchesTraderLensPrice(10, resolveTraderLensBounds("band_10_50", null, null))).toBe(true);
    expect(matchesTraderLensPrice(50, resolveTraderLensBounds("band_10_50", null, null))).toBe(true);
    expect(matchesTraderLensPrice(50.01, resolveTraderLensBounds("band_10_50", null, null))).toBe(false);
  });

  it("uses custom min/max and treats empty custom as no restriction", () => {
    expect(resolveTraderLensBounds("custom", 3, 8)).toEqual({ min: 3, max: 8 });
    expect(matchesTraderLensPrice(3, { min: 3, max: 8 })).toBe(true);
    expect(matchesTraderLensPrice(8, { min: 3, max: 8 })).toBe(true);
    expect(matchesTraderLensPrice(2.99, { min: 3, max: 8 })).toBe(false);
    expect(resolveTraderLensBounds("custom", null, null)).toEqual({ min: null, max: null });
    expect(parseTraderLensPriceInput("")).toBeNull();
    expect(parseTraderLensPriceInput("nope")).toBeNull();
    expect(parseTraderLensPriceInput("-1")).toBeNull();
    expect(parseTraderLensPriceInput("12.5")).toBe(12.5);
  });

  it("does not filter All Movers, including missing prices", () => {
    const bounds = resolveTraderLensBounds("all_movers", 2, 20);
    const ranked = rankRadarRows(
      [
        row({ symbol: "PENNY", volume: 9_000_000, price: 0.8 }),
        row({ symbol: "MID", volume: 5_000_000, price: 6.4 }),
        row({ symbol: "GAP", volume: 1_000_000, price: null }),
      ],
      "available",
    );
    const filtered = applyTraderLensPriceFilter(ranked, bounds);
    expect(filtered.map((item) => item.symbol)).toEqual(["PENNY", "MID", "GAP"]);
    expect(filtered.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("preserves original Radar order and ranks after filtering", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "PENNY", volume: 9_000_000, price: 0.8 }),
        row({ symbol: "MID", volume: 5_000_000, price: 6.4 }),
        row({ symbol: "HIGH", volume: 1_000_000, price: 15.2 }),
      ],
      "available",
    );
    const filtered = applyTraderLensPriceFilter(
      ranked,
      resolveTraderLensBounds("momentum_2_20", null, null),
    );
    expect(filtered.map((item) => item.symbol)).toEqual(["MID", "HIGH"]);
    expect(filtered.map((item) => item.rank)).toEqual([2, 3]);
    expect(filtered[0].signal).toBe("VOLUME LEADER");
    expect(traderLensShowingCopy(filtered.length, ranked.length)).toBe(
      "Showing 2 of 3 Radar candidates",
    );
  });

  it("handles missing price honestly when a price band is active", () => {
    expect(matchesTraderLensPrice(null, { min: 2, max: 20 })).toBe(false);
    expect(matchesTraderLensPrice(undefined, { min: 1, max: null })).toBe(false);
    expect(matchesTraderLensPrice(Number.NaN, { min: null, max: 10 })).toBe(false);
    expect(matchesTraderLensPrice(null, { min: null, max: null })).toBe(true);
  });

  it("does not change Follow #1 behavior when a price lens is applied", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "PENNY", volume: 9_000_000, price: 0.8 }),
        row({ symbol: "MID", volume: 5_000_000, price: 6.4 }),
      ],
      "available",
    );
    const filtered = applyTraderLensPriceFilter(
      ranked,
      resolveTraderLensBounds("momentum_2_20", null, null),
    );
    expect(filtered.map((item) => item.symbol)).toEqual(["MID"]);
    const following = radarSelectionReducer(INITIAL_RADAR_SELECTION, {
      type: "board_updated",
      rows: ranked,
    });
    expect(following.mode).toBe("follow_leader");
    expect(following.selectedSymbol).toBe("PENNY");
  });
});
