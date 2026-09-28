import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { RadarRankingFields } from "../types";
import { formatScreenerRvol5m } from "@/lib/screeners/screener-metric-display";
import { rankRadarRows } from "../radar-metrics";
import { selectPanelLeader } from "../multi-radar";
import {
  buildDayTradeRadarOpportunityBoard,
  computeDayTradeRadarScore,
  formatDayTradeRadarStatusSuffix,
  meetsDayTradeRadarEligibility,
  meetsDayTradeRadarLiquidityGate,
  tradabilityFactor,
} from "../day-trade-radar-opportunity";

const NOW = Date.parse("2026-09-16T15:00:00.000Z");

type RowInput = Partial<ScreenerResultRow & RadarRankingFields> &
  Pick<ScreenerResultRow, "symbol" | "volume">;

function row(overrides: RowInput): ScreenerResultRow & RadarRankingFields {
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

function peersFrom(rows: ReturnType<typeof rankRadarRows>) {
  return {
    sessionVolumes: rows.map((r) => r.volume ?? 0),
    volume60s: rows.map((r) => r.rolling_volume_60s ?? 0).filter((n) => n > 0),
    velocities: rows.map((r) => r.vol_velocity ?? 0).filter((n) => n > 0),
    dollar60s: [],
    rvol5m: rows.map((r) => r.rvol_5m ?? 0).filter((n) => n > 0),
    timeAdjustedRvol: [],
    acceleration5m: rows.map((r) => r.acceleration_5m ?? 0).filter((n) => n > 0),
  };
}

describe("Day Trade Radar opportunity desk V1.1", () => {
  it("fresh surging lower session volume beats stale cooling high session volume", () => {
    const universe = rankRadarRows(
      [
        row({
          symbol: "STALEBIG",
          volume: 13_000_000,
          freshness_class: "cooling",
          volume_acceleration_pct: -35,
          rolling_volume_60s: 35_000,
          vol_velocity: 130_000,
          distance_from_hod_pct: 8,
          signal_status: "COOLING",
          promoted_at: "2026-09-16T08:00:00.000Z",
        }),
        row({
          symbol: "SURGING",
          volume: 3_000_000,
          freshness_class: "fresh",
          volume_acceleration_pct: 120,
          rolling_volume_60s: 200_000,
          vol_velocity: 200_000,
          acceleration_5m: 3.5,
          distance_from_hod_pct: 0.3,
          signal_status: "EXPLOSIVE",
          promoted_at: "2026-09-16T14:55:00.000Z",
        }),
      ],
      "available",
    );

    const board = buildDayTradeRadarOpportunityBoard(universe, NOW);
    expect(board.topOpportunities[0]?.symbol).toBe("SURGING");
    const staleScore = computeDayTradeRadarScore(universe[0], peersFrom(universe), NOW);
    const freshScore = computeDayTradeRadarScore(universe[1], peersFrom(universe), NOW);
    expect(freshScore.total).toBeGreaterThan(staleScore.total);
    expect(freshScore.explain.reasons.some((r) => r === "volume_surge" || r === "strong_current_participation")).toBe(true);
    expect(staleScore.explain.penalties).toContain("cooling_momentum");
  });

  it("renewed acceleration can restore rank after cooling", () => {
    const base = row({
      symbol: "RENEW",
      volume: 5_000_000,
      rolling_volume_60s: 80_000,
      vol_velocity: 8_000,
      freshness_class: "cooling",
      volume_acceleration_pct: -25,
      signal_status: "COOLING",
      promoted_at: "2026-09-16T07:00:00.000Z",
    });
    const cooled = rankRadarRows([base], "available");
    const reactivated = rankRadarRows(
      [
        row({
          symbol: "RENEW",
          volume: 5_000_000,
          rolling_volume_60s: 190_000,
          vol_velocity: 180_000,
          freshness_class: "fresh",
          volume_acceleration_pct: 95,
          signal_status: "REACTIVATED",
          promoted_at: "2026-09-16T14:58:00.000Z",
        }),
      ],
      "available",
    );
    const before = computeDayTradeRadarScore(cooled[0], peersFrom(cooled), NOW);
    const after = computeDayTradeRadarScore(reactivated[0], peersFrom(reactivated), NOW);
    expect(after.total).toBeGreaterThan(before.total);
    expect(after.explain.reasons).toContain("volume_surge");
  });

  it("rejects weak illiquid sub-$1 from main desk; allows exceptional sub-$1", () => {
    const weak = rankRadarRows(
      [row({ symbol: "WEAKP", volume: 200_000, price: 0.18, vol_velocity: 1_000, rolling_volume_60s: 800 })],
      "available",
    )[0];
    expect(meetsDayTradeRadarEligibility(weak)).toBe(false);

    const strong = rankRadarRows(
      [
        row({
          symbol: "STRONGP",
          volume: 13_000_000,
          price: 0.32,
          vol_velocity: 100_000,
          rolling_volume_60s: 120_000,
          rolling_dollar_volume_60s: 350_000,
          freshness_class: "active",
          volume_acceleration_pct: 60,
          signal_status: "BUILDING",
        }),
        row({ symbol: "MAIN", volume: 4_000_000, price: 12, rolling_volume_60s: 50_000, vol_velocity: 10_000, freshness_class: "active", volume_acceleration_pct: 20, signal_status: "BUILDING" }),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(strong, NOW);
    expect(board.topOpportunities.some((r) => r.symbol === "STRONGP")).toBe(true);
  });

  it("penalizes expensive ordinary tape vs accessible comparable; allows exceptional expensive", () => {
    const accessible = rankRadarRows(
      [
        row({
          symbol: "MID",
          price: 15,
          volume: 4_000_000,
          rolling_volume_60s: 100_000,
          vol_velocity: 20_000,
          freshness_class: "active",
          volume_acceleration_pct: 40,
          signal_status: "BUILDING",
        }),
      ],
      "available",
    )[0];
    const expensiveOrdinary = rankRadarRows(
      [
        {
          ...accessible,
          symbol: "EXPENSIVE",
          price: 350,
          volume: 4_000_000,
        },
      ],
      "available",
    )[0];
    const peers = peersFrom([accessible, expensiveOrdinary]);
    const midScore = computeDayTradeRadarScore(accessible, peers, NOW);
    const expScore = computeDayTradeRadarScore(expensiveOrdinary, peers, NOW);
    expect(tradabilityFactor(accessible)).toBeGreaterThan(tradabilityFactor(expensiveOrdinary));
    expect(midScore.total).toBeGreaterThan(expScore.total);

    const exceptionalExpensive = rankRadarRows(
      [
        row({
          symbol: "BIGCAP",
          price: 320,
          volume: 8_000_000,
          rolling_volume_60s: 250_000,
          vol_velocity: 80_000,
          volume_acceleration_pct: 110,
          signal_status: "EXPLOSIVE",
          freshness_class: "fresh",
          distance_from_hod_pct: 0.2,
        }),
        row({
          symbol: "SMALL",
          price: 12,
          volume: 2_000_000,
          rolling_volume_60s: 40_000,
          vol_velocity: 8_000,
          volume_acceleration_pct: 15,
          signal_status: "BUILDING",
          freshness_class: "active",
        }),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(exceptionalExpensive, NOW);
    expect(board.topOpportunities[0]?.symbol).toBe("BIGCAP");
  });

  it("cheap weak setup does not beat stronger liquid accessible setup", () => {
    const universe = rankRadarRows(
      [
        row({ symbol: "CHEAP", price: 3, volume: 50_000, vol_velocity: 400, rolling_volume_60s: 400 }),
        row({
          symbol: "LIQUID",
          price: 14,
          volume: 3_000_000,
          vol_velocity: 15_000,
          rolling_volume_60s: 85_000,
          freshness_class: "active",
          volume_acceleration_pct: 35,
          signal_status: "BUILDING",
        }),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(universe, NOW);
    expect(board.topOpportunities[0]?.symbol).toBe("LIQUID");
    expect(board.topOpportunities.some((r) => r.symbol === "CHEAP")).toBe(false);
  });

  it("uses verified catalyst in score when provided in context", () => {
    const base = rankRadarRows(
      [
        row({
          symbol: "AAA",
          volume: 3_000_000,
          rolling_volume_60s: 90_000,
          vol_velocity: 15_000,
          freshness_class: "active",
          volume_acceleration_pct: 30,
          signal_status: "BUILDING",
        }),
      ],
      "available",
    )[0];
    const peers = peersFrom([base]);
    const neutral = computeDayTradeRadarScore(base, peers, NOW);
    const withCat = computeDayTradeRadarScore(base, peers, NOW, { verifiedCatalyst: "direct" });
    expect(withCat.total).toBeGreaterThan(neutral.total);
    expect(withCat.explain.reasons).toContain("verified_catalyst");
  });

  it("does not require catalyst for extraordinary tape", () => {
    const tape = rankRadarRows(
      [
        row({
          symbol: "TAPE",
          volume: 5_000_000,
          rolling_volume_60s: 150_000,
          vol_velocity: 40_000,
          volume_acceleration_pct: 90,
          signal_status: "EXPLOSIVE",
          freshness_class: "fresh",
          distance_from_hod_pct: 0.4,
        }),
      ],
      "available",
    )[0];
    const score = computeDayTradeRadarScore(tape, peersFrom([tape]), NOW);
    expect(score.eligible).toBe(true);
    expect(score.explain.components.catalystEvent).toBeLessThanOrEqual(50);
  });

  it("quality floor returns fewer than ten ranked names", () => {
    const many = rankRadarRows(
      [
        ...Array.from({ length: 3 }, (_, i) =>
          row({
            symbol: `GOOD${i}`,
            volume: 3_000_000 - i * 100_000,
            rolling_volume_60s: 90_000,
            vol_velocity: 12_000,
            freshness_class: "active",
            volume_acceleration_pct: 35,
            signal_status: "BUILDING",
          }),
        ),
        ...Array.from({ length: 20 }, (_, i) =>
          row({
            symbol: `WEAK${i}`,
            volume: 2_000 + i,
            rolling_volume_60s: 400,
            vol_velocity: 400,
            freshness_class: "stale",
            volume_acceleration_pct: -30,
            signal_status: "COOLING",
          }),
        ),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(many, NOW);
    expect(board.candidateUniverseCount).toBe(23);
    expect(board.qualifiedCount).toBeLessThan(10);
    expect(board.topOpportunities.length).toBe(board.qualifiedCount);
    expect(formatDayTradeRadarStatusSuffix({
      candidateUniverseCount: 59,
      topOpportunityCount: 7,
    })).toBe("59 candidates detected · 7 ranked for Radar");
  });

  it("Top Leader equals opportunity rank #1", () => {
    const universe = rankRadarRows(
      [
        row({ symbol: "VOL1", volume: 10_000_000, rolling_volume_60s: 50_000, vol_velocity: 5_000, freshness_class: "cooling", volume_acceleration_pct: -10, signal_status: "COOLING" }),
        row({ symbol: "OPP1", volume: 4_000_000, rolling_volume_60s: 120_000, vol_velocity: 25_000, freshness_class: "fresh", volume_acceleration_pct: 70, signal_status: "EXPLOSIVE" }),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(universe, NOW);
    const leader = selectPanelLeader("day_trade", board.topOpportunities);
    expect(leader?.symbol).toBe(board.topOpportunities[0]?.symbol);
    expect(leader?.rank).toBe(1);
  });

  it("rvol_5m null stays honest in display", () => {
    expect(formatScreenerRvol5m(null)).toBe("—");
    expect(formatScreenerRvol5m(2.4)).toBe("2.4×");
  });

  it("liquidity gate rejects 2K / 400 sh min weak tape", () => {
    const weak = rankRadarRows([row({ symbol: "X", volume: 2_000, rolling_volume_60s: 400, vol_velocity: 400 })], "available")[0];
    expect(meetsDayTradeRadarLiquidityGate(weak)).toBe(false);
  });

  it("promoted_at recency uses first-seen semantics (4:00 AM cluster = first qualification, not UI inference)", () => {
    const early = rankRadarRows(
      [
        row({
          symbol: "PRE",
          volume: 5_000_000,
          rolling_volume_60s: 90_000,
          vol_velocity: 15_000,
          promoted_at: "2026-09-16T08:00:05.000Z",
          freshness_class: "cooling",
          volume_acceleration_pct: -5,
          signal_status: "COOLING",
        }),
      ],
      "available",
    )[0];
    const score = computeDayTradeRadarScore(early, peersFrom([early]), NOW);
    expect(score.explain.penalties).not.toContain("fabricated_trigger");
    expect(score.explain.components.freshness).toBeLessThan(70);
  });
});
