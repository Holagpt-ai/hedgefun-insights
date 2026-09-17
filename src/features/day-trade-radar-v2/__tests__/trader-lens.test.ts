import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import {
  CORE_MOMENTUM_MOVE_UNAVAILABLE_COPY,
  CORE_MOMENTUM_SESSION_MOVE_MIN,
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
  applyTraderLensFilter,
  applyTraderLensPriceFilter,
  isBroadTraderLens,
  matchesTraderLensPrice,
  traderLensShowingCopy,
  visibleTopLeaderRow,
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
    avg_volume_20d: null,
    rvol_20d: null,
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
  it("defaults to Core Momentum $2–$20", () => {
    expect(DEFAULT_TRADER_LENS_PRESET_ID).toBe("momentum_2_20");
    expect(getTraderLensPreset("momentum_2_20")).toEqual({
      id: "momentum_2_20",
      label: "Core Momentum $2–$20",
      min: 2,
      max: 20,
    });
    expect(getTraderLensPreset("all_movers")?.label).toBe("All Radar Movers");
    expect(TRADER_LENS_PRESETS[0].id).toBe("momentum_2_20");
    expect(CORE_MOMENTUM_SESSION_MOVE_MIN).toBe(10);
  });

  it("applies inclusive $2–$20 Core Momentum price boundaries", () => {
    const bounds = resolveTraderLensBounds("momentum_2_20", null, null);
    expect(matchesTraderLensPrice(2, bounds)).toBe(true);
    expect(matchesTraderLensPrice(20, bounds)).toBe(true);
    expect(matchesTraderLensPrice(1.99, bounds)).toBe(false);
    expect(matchesTraderLensPrice(20.01, bounds)).toBe(false);
  });

  it("All Radar Movers restores the broad candidate view", () => {
    const bounds = resolveTraderLensBounds("all_movers", 2, 20);
    const ranked = rankRadarRows(
      [
        row({ symbol: "PENNY", volume: 9_000_000, price: 0.8 }),
        row({ symbol: "MID", volume: 5_000_000, price: 6.4 }),
        row({ symbol: "GAP", volume: 1_000_000, price: null }),
      ],
      "available",
    );
    const filtered = applyTraderLensFilter(ranked, "all_movers", bounds);
    expect(filtered.rows.map((item) => item.symbol)).toEqual(["PENNY", "MID", "GAP"]);
    expect(filtered.rows.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(filtered.sessionMoveFilterApplied).toBe(false);
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

  it("preserves original Radar order and ranks after filtering", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "PENNY", volume: 9_000_000, price: 0.8 }),
        row({ symbol: "MID", volume: 5_000_000, price: 6.4 }),
        row({ symbol: "HIGH", volume: 1_000_000, price: 15.2 }),
      ],
      "available",
    );
    const filtered = applyTraderLensFilter(
      ranked,
      "momentum_2_20",
      resolveTraderLensBounds("momentum_2_20", null, null),
    );
    expect(filtered.rows.map((item) => item.symbol)).toEqual(["MID", "HIGH"]);
    expect(filtered.rows.map((item) => item.rank)).toEqual([2, 3]);
    expect(filtered.sessionMoveUnavailable).toBe(true);
    expect(filtered.sessionMoveFilterApplied).toBe(false);
    expect(traderLensShowingCopy(filtered.rows.length, ranked.length)).toBe(
      "Showing 2 of 3 Radar candidates",
    );
  });

  it("enforces +10% Core Momentum only when regular-session move is verified", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "WEAK", volume: 9_000_000, price: 8, change_percent: 4 }),
        row({ symbol: "STRONG", volume: 5_000_000, price: 9, change_percent: 12 }),
        row({ symbol: "PENNY", volume: 1_000_000, price: 0.8, change_percent: 40 }),
      ],
      "available",
    );
    const filtered = applyTraderLensFilter(
      ranked,
      "momentum_2_20",
      resolveTraderLensBounds("momentum_2_20", null, null),
    );
    expect(filtered.sessionMoveFilterApplied).toBe(true);
    expect(filtered.rows.map((item) => item.symbol)).toEqual(["STRONG"]);
    expect(filtered.rows[0].rank).toBe(2);
  });

  it("does not substitute 15s/60s move when session move is missing", () => {
    const ranked = rankRadarRows(
      [
        row({
          symbol: "AAA",
          volume: 5_000_000,
          price: 8,
          change_percent: null,
        }),
      ],
      "available",
    );
    const withShortWindow = ranked.map((item) => ({
      ...item,
      move_15s_pct: 40,
      move_60s_pct: 25,
    }));
    const filtered = applyTraderLensFilter(
      withShortWindow,
      "momentum_2_20",
      resolveTraderLensBounds("momentum_2_20", null, null),
    );
    expect(filtered.sessionMoveFilterApplied).toBe(false);
    expect(filtered.sessionMoveUnavailable).toBe(true);
    expect(filtered.rows).toHaveLength(1);
    expect(CORE_MOMENTUM_MOVE_UNAVAILABLE_COPY).toMatch(/regular-session move unavailable/i);
  });

  it("handles missing price honestly when a price band is active", () => {
    expect(matchesTraderLensPrice(null, { min: 2, max: 20 })).toBe(false);
    expect(matchesTraderLensPrice(undefined, { min: 1, max: null })).toBe(false);
    expect(matchesTraderLensPrice(Number.NaN, { min: null, max: 10 })).toBe(false);
    expect(matchesTraderLensPrice(0, { min: 2, max: 20 })).toBe(false);
    expect(matchesTraderLensPrice(0.27, { min: 2, max: 20 })).toBe(false);
    expect(matchesTraderLensPrice(null, { min: null, max: null })).toBe(true);
  });

  it("uses broad #1 as visible Top Leader for All Radar Movers", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "SDST", volume: 9_000_000, price: 0.27 }),
        row({ symbol: "XYZ", volume: 5_000_000, price: 0.8 }),
        row({ symbol: "ABC", volume: 1_000_000, price: 6.4 }),
      ],
      "available",
    );
    const bounds = resolveTraderLensBounds("all_movers", null, null);
    const filtered = applyTraderLensPriceFilter(ranked, bounds);
    expect(isBroadTraderLens(bounds)).toBe(true);
    expect(visibleTopLeaderRow(ranked, filtered, bounds)?.symbol).toBe("SDST");
    expect(visibleTopLeaderRow(ranked, filtered, bounds)?.rank).toBe(1);

    const following = radarSelectionReducer(INITIAL_RADAR_SELECTION, {
      type: "board_updated",
      rows: ranked,
      topLeader: visibleTopLeaderRow(ranked, filtered, bounds),
      lensConstrained: false,
    });
    expect(following.selectedSymbol).toBe("SDST");
  });

  it("uses first eligible filtered row as visible Top Leader under Core Momentum", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "SDST", volume: 9_000_000, price: 0.27 }),
        row({ symbol: "XYZ", volume: 5_000_000, price: 0.8 }),
        row({ symbol: "ABC", volume: 1_000_000, price: 6.4 }),
      ],
      "available",
    );
    const bounds = resolveTraderLensBounds("momentum_2_20", null, null);
    const filtered = applyTraderLensPriceFilter(ranked, bounds);
    expect(filtered.map((item) => item.symbol)).toEqual(["ABC"]);
    const leader = visibleTopLeaderRow(ranked, filtered, bounds);
    expect(leader?.symbol).toBe("ABC");
    expect(leader?.rank).toBe(3);

    const following = radarSelectionReducer(INITIAL_RADAR_SELECTION, {
      type: "board_updated",
      rows: ranked,
      topLeader: leader,
      lensConstrained: true,
    });
    expect(following.mode).toBe("follow_leader");
    expect(following.selectedSymbol).toBe("ABC");
  });

  it("returns no visible Top Leader when the active lens has zero eligible rows", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "SDST", volume: 9_000_000, price: 0.27 }),
        row({ symbol: "XYZ", volume: 5_000_000, price: 0.8 }),
      ],
      "available",
    );
    const bounds = resolveTraderLensBounds("momentum_2_20", null, null);
    const filtered = applyTraderLensPriceFilter(ranked, bounds);
    expect(filtered).toEqual([]);
    expect(visibleTopLeaderRow(ranked, filtered, bounds)).toBeNull();

    const following = radarSelectionReducer(INITIAL_RADAR_SELECTION, {
      type: "board_updated",
      rows: ranked,
      topLeader: null,
      lensConstrained: true,
    });
    expect(following.selectedSymbol).toBeNull();
    expect(following.snapshot).toBeNull();
  });
});
