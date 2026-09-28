import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import { rankRadarRows } from "../radar-metrics";
import {
  buildDayTradeRadarOpportunityBoard,
  computeDayTradeRadarScore,
  formatDayTradeRadarStatusSuffix,
  meetsDayTradeRadarLiquidityGate,
} from "../day-trade-radar-opportunity";
import { attentionTierForOpportunityRank } from "@/config/day-trade-radar-opportunity.config";

const NOW = Date.parse("2026-09-16T15:00:00.000Z");

function row(
  overrides: Partial<ScreenerResultRow> & Pick<ScreenerResultRow, "symbol" | "volume">,
): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.symbol,
    price: overrides.price ?? 10,
    change_percent: overrides.change_percent ?? 12,
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
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-16T14:55:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T14:55:00.000Z",
    ...overrides,
  };
}

describe("Day Trade Radar opportunity desk", () => {
  it("ranks a cooling high-volume name below an accelerating active name", () => {
    const universe = rankRadarRows(
      [
        row({
          symbol: "STALEBIG",
          volume: 13_900_000,
          freshness_class: "cooling",
          volume_acceleration_pct: -30,
          rolling_volume_60s: 40_000,
          vol_velocity: 3_000,
          distance_from_hod_pct: 8,
          signal_status: "COOLING",
          promoted_at: "2026-09-16T08:00:00.000Z",
        }),
        row({
          symbol: "NOW",
          volume: 4_000_000,
          freshness_class: "fresh",
          volume_acceleration_pct: 80,
          rolling_volume_60s: 120_000,
          vol_velocity: 25_000,
          acceleration_5m: 4,
          distance_from_hod_pct: 0.4,
          signal_status: "EXPLOSIVE",
          primary_scanner_event: "VOLUME_BURST",
          promoted_at: "2026-09-16T14:50:00.000Z",
        }),
      ],
      "available",
    );

    const board = buildDayTradeRadarOpportunityBoard(universe, NOW);
    expect(board.topOpportunities[0]?.symbol).toBe("NOW");
    expect(board.topOpportunities[0]?.volume_rank).toBe(2);
    expect(board.topOpportunities[0]?.rank).toBe(1);
  });

  it("does not force ten when fewer names qualify", () => {
    const universe = rankRadarRows(
      [
        row({
          symbol: "GOOD",
          volume: 3_000_000,
          rolling_volume_60s: 90_000,
          vol_velocity: 12_000,
          freshness_class: "active",
          volume_acceleration_pct: 40,
          signal_status: "BUILDING",
        }),
        row({
          symbol: "WEAK",
          volume: 10_000,
          rolling_volume_60s: 500,
          vol_velocity: 100,
          freshness_class: "stale",
          volume_acceleration_pct: -40,
        }),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(universe, NOW);
    expect(board.candidateUniverseCount).toBe(2);
    expect(board.topOpportunities.length).toBeLessThanOrEqual(10);
    expect(board.topOpportunities.every((r) => r.symbol !== "WEAK" || board.qualifiedCount > 1)).toBe(true);
  });

  it("caps at ten and assigns attention tiers", () => {
    const many = rankRadarRows(
      Array.from({ length: 20 }, (_, i) =>
        row({
          symbol: `S${i}`,
          volume: 5_000_000 - i * 100_000,
          rolling_volume_60s: 80_000 - i * 1_000,
          vol_velocity: 15_000 - i * 200,
          freshness_class: "active",
          volume_acceleration_pct: 35,
          signal_status: "BUILDING",
        }),
      ),
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(many, NOW);
    expect(board.topOpportunities).toHaveLength(10);
    expect(board.topOpportunities[0]?.attention_tier).toBe("PRIME");
    expect(board.topOpportunities[2]?.attention_tier).toBe("PRIME");
    expect(board.topOpportunities[3]?.attention_tier).toBe("ACTIVE");
    expect(board.topOpportunities[9]?.attention_tier).toBe("WATCH");
    expect(attentionTierForOpportunityRank(11)).toBeNull();
  });

  it("formats transparent candidate vs ranked copy", () => {
    expect(
      formatDayTradeRadarStatusSuffix({ candidateUniverseCount: 59, topOpportunityCount: 10 }),
    ).toBe("59 candidates detected · 10 ranked for Radar");
    expect(
      formatDayTradeRadarStatusSuffix({ candidateUniverseCount: 4, topOpportunityCount: 4 }),
    ).toBe("4 qualifying Radar opportunities");
  });

  it("keeps sub-$1 names off the main Top-10 desk (Penny panel uses the full universe)", () => {
    const universe = rankRadarRows(
      [
        row({ symbol: "PENNY", volume: 9_000_000, price: 0.5, rolling_volume_60s: 100_000, vol_velocity: 20_000, freshness_class: "active", volume_acceleration_pct: 50, signal_status: "BUILDING" }),
        row({ symbol: "MAIN", volume: 4_000_000, price: 8, rolling_volume_60s: 90_000, vol_velocity: 18_000, freshness_class: "active", volume_acceleration_pct: 45, signal_status: "BUILDING" }),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(universe, NOW);
    expect(board.candidateUniverseCount).toBe(2);
    expect(board.topOpportunities.every((r) => r.symbol !== "PENNY")).toBe(true);
    expect(board.topOpportunities[0]?.symbol).toBe("MAIN");
  });

  it("liquidity gate rejects empty participation without exceptional session volume", () => {
    const weak = rankRadarRows([row({ symbol: "X", volume: 20_000, rolling_volume_60s: 100 })], "available")[0];
    expect(meetsDayTradeRadarLiquidityGate(weak)).toBe(false);
    const score = computeDayTradeRadarScore(weak, { sessionVolumes: [20_000], volume60s: [100], velocities: [], dollar60s: [], rvol5m: [], timeAdjustedRvol: [] }, NOW);
    expect(score.eligible).toBe(false);
  });
});
