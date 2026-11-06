import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import {
  buildDayTradeRadarOpportunityBoard,
  formatDayTradeRadarStatusSuffix,
} from "@/features/day-trade-radar-v2/day-trade-radar-opportunity";
import { rankRadarRows } from "@/features/day-trade-radar-v2/radar-metrics";
import type { RadarRankedRow, RadarRankingFields } from "@/features/day-trade-radar-v2/types";
import {
  qualifyPanelRows,
  rowMatchesPanelFilters,
} from "@/features/day-trade-radar-v2/multi-radar";
import { qualifiesDayTradeMomentum } from "@/features/day-trade-radar-v2/day-trade-strategy";
import { qualifiesDayTradeFreshness } from "@/features/day-trade-radar-v2/day-trade-freshness";
import { buildScannerTabEvidence } from "@/lib/screeners/scanner-tab-evidence";
import {
  resolveUnusualVolumeQualificationSignal,
  UNUSUAL_VOLUME_PRIOR_RATIO,
  UNUSUAL_VOLUME_TIME_ADJUSTED_RVOL,
} from "@/lib/screeners/scanner-tab-qualification";

const NOW = Date.parse("2026-09-16T15:00:00.000Z");

type RowInput = Partial<ScreenerResultRow & RadarRankingFields> &
  Pick<ScreenerResultRow, "symbol" | "volume">;

function row(
  overrides: RowInput & { rank?: number },
): ScreenerResultRow & RadarRankingFields {
  return {
    tab_id: "day_trade_radar",
    rank: overrides.rank ?? 1,
    company_name: overrides.symbol,
    price: overrides.price ?? 10,
    change_percent: overrides.change_percent ?? 15,
    volume: overrides.volume,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: 1_000_000,
    rvol_20d: 5,
    float_shares: 4_000_000,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 500_000,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-16T14:55:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T14:55:00.000Z",
    rolling_volume_60s: 120_000,
    vol_velocity: 200_000,
    freshness_class: "fresh",
    volume_acceleration_pct: 50,
    signal_status: "BUILDING",
    promoted_at: "2026-09-16T14:50:00.000Z",
    ...overrides,
  };
}

function deskRow(
  overrides: Partial<RadarRankedRow> & Pick<RadarRankedRow, "symbol" | "rank">,
): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.symbol,
    price: 8,
    change_percent: 15,
    volume: 5_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: 1_000_000,
    rvol_20d: 5,
    float_shares: 4_000_000,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 500_000,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-16T14:55:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T14:55:00.000Z",
    signal: "VOLUME LEADER",
    hod_distance_percent: 2,
    ...overrides,
  };
}

describe("Batch 196.2 presentation parity", () => {
  it("status Five Pillars count matches freshness-inclusive gate audit, not momentum alone", () => {
    const universe = rankRadarRows(
      [
        row({ symbol: "FRESH", volume: 5_000_000, freshness_class: "fresh" }),
        row({
          symbol: "STALE",
          volume: 5_000_000,
          freshness_class: "stale",
          volume_acceleration_pct: -20,
          signal_status: "COOLING",
          promoted_at: "2026-09-16T08:00:00.000Z",
        }),
      ],
      "available",
    );
    const board = buildDayTradeRadarOpportunityBoard(universe, NOW);
    expect(board.gateAudit.qualifiedStrategyCount).toBe(2);
    expect(board.gateAudit.qualifiedFreshCount).toBe(1);
    expect(board.funnel.qualifiedCount).toBe(board.gateAudit.qualifiedFreshCount);

    const suffix = formatDayTradeRadarStatusSuffix({
      candidateUniverseCount: board.candidateUniverseCount,
      topOpportunityCount: board.topOpportunities.length,
      momentumQualifiedCount: board.gateAudit.qualifiedStrategyCount,
      fivePillarsPassedCount: board.gateAudit.qualifiedFreshCount,
      funnel: board.funnel,
    });
    expect(suffix).toContain("2 momentum-qualified · 1 Five Pillars passed");
    expect(suffix).not.toMatch(/2 Five Pillars passed/);
  });

  it("failed freshness is not counted as a full Five Pillars pass in the funnel", () => {
    const ranked = rankRadarRows(
      [
        row({
          symbol: "ONLY",
          rank: 1,
          volume: 5_000_000,
          freshness_class: "stale",
          volume_acceleration_pct: -40,
          signal_status: "COOLING",
          promoted_at: "2026-09-16T08:00:00.000Z",
        }),
      ],
      "available",
    );
    const r = ranked[0]!;
    expect(qualifiesDayTradeMomentum(r)).toBe(true);
    expect(qualifiesDayTradeFreshness(r, NOW)).toBe(false);
    const board = buildDayTradeRadarOpportunityBoard(ranked, NOW);
    expect(board.funnel.qualifiedCount).toBe(0);
  });

  it("sub-$2 names stay off the qualified Day Trade desk panel", () => {
    const rows = [
      deskRow({ symbol: "PENNY", rank: 1, price: 1.25 }),
      deskRow({ symbol: "TRADE", rank: 2, price: 8 }),
    ];
    expect(qualifyPanelRows(rows, "day_trade", "under_1", NOW).map((r) => r.symbol)).toEqual([
      "TRADE",
    ]);
  });

  it("settings price filters cannot resurrect Day Trade-ineligible rows", () => {
    const rows = [
      deskRow({ symbol: "PENNY", rank: 1, price: 1.25 }),
      deskRow({ symbol: "TRADE", rank: 2, price: 8 }),
    ];
    const qualified = qualifyPanelRows(rows, "day_trade", "under_1", NOW);
    const relaxedFilters = { minPrice: "0.01", maxPrice: "", minVolume: "", minMovePct: "" };
    const filtered = qualified.filter((r) => rowMatchesPanelFilters(r, relaxedFilters));
    expect(filtered.map((r) => r.symbol)).toEqual(["TRADE"]);
  });

  it("penny and breakouts panels stay independent from Day Trade qualification", () => {
    const rows = [
      deskRow({
        symbol: "PENNY",
        price: 0.45,
        rank: 1,
        primary_scanner_event: "HOD_BREAK",
        scanner_events: [{ type: "HOD_BREAK", triggered_at: new Date(NOW - 60_000).toISOString(), active: true }],
      }),
      deskRow({ symbol: "TRADE", price: 8, rank: 2 }),
    ];
    expect(qualifyPanelRows(rows, "penny").map((r) => r.symbol)).toContain("PENNY");
    expect(qualifyPanelRows(rows, "breakouts", "under_1", NOW).map((r) => r.symbol)).toContain(
      "PENNY",
    );
    expect(qualifyPanelRows(rows, "day_trade", "under_1", NOW).map((r) => r.symbol)).not.toContain(
      "PENNY",
    );
  });

  it("Unusual Volume evidence labels match qualification signal without mislabeling TARVOL", () => {
    const priorRow = {
      symbol: "PRIOR",
      last_price: 10,
      session_volume: 4_000_000,
      prior_session_volume: 1_000_000,
      volume_velocity: null,
      volume_acceleration_pct: null,
      volume_60s: null,
      time_adjusted_rvol: null,
    };
    expect(resolveUnusualVolumeQualificationSignal(priorRow).signal).toBe("prior_session_ratio");
    const priorEvidence = buildScannerTabEvidence(
      "unusual_volume",
      {
        tab_id: "unusual_volume",
        symbol: "PRIOR",
        company_name: null,
        price: 10,
        change_percent: 5,
        volume: 4_000_000,
        prior_session_volume: 1_000_000,
        volume_ratio_prior_session: 4,
        avg_volume: null,
        rvol: null,
        float_shares: null,
        gap_percent: null,
        high_52w: null,
        low_52w: null,
        range_event: null,
        market_cap: null,
        avg_volume_20d: null,
        rvol_20d: null,
        day_high: null,
        day_low: null,
        provider_as_of: "2026-09-30T08:00:00.000Z",
        sync_run_id: "run",
        updated_at: "2026-09-30T08:00:00.000Z",
      },
    );
    expect(priorEvidence?.primaryLabel).toContain("Vol/Yday");
    expect(priorEvidence?.detail).toContain(String(UNUSUAL_VOLUME_PRIOR_RATIO));

    const tarvolRow = {
      ...priorRow,
      symbol: "TARVOL",
      session_volume: 800_000,
      prior_session_volume: 700_000,
      time_adjusted_rvol: UNUSUAL_VOLUME_TIME_ADJUSTED_RVOL + 0.5,
    };
    expect(resolveUnusualVolumeQualificationSignal(tarvolRow).signal).toBe("time_adjusted_rvol");
    const tarvolEvidence = buildScannerTabEvidence(
      "unusual_volume",
      {
        tab_id: "unusual_volume",
        symbol: "TARVOL",
        company_name: null,
        price: 10,
        change_percent: 5,
        volume: 800_000,
        prior_session_volume: 700_000,
        volume_ratio_prior_session: 1.1,
        avg_volume: null,
        rvol: null,
        float_shares: null,
        gap_percent: null,
        high_52w: null,
        low_52w: null,
        range_event: null,
        market_cap: null,
        avg_volume_20d: null,
        rvol_20d: null,
        day_high: null,
        day_low: null,
        provider_as_of: "2026-09-30T08:00:00.000Z",
        sync_run_id: "run",
        updated_at: "2026-09-30T08:00:00.000Z",
        time_adjusted_rvol: UNUSUAL_VOLUME_TIME_ADJUSTED_RVOL + 0.5,
      } as ScreenerResultRow & { time_adjusted_rvol: number },
    );
    expect(tarvolEvidence?.primaryLabel).toContain("Time-adjusted RVOL");
    expect(tarvolEvidence?.primaryLabel).not.toContain("Vol/Yday");
    expect(tarvolEvidence?.detail).not.toMatch(/5-minute|VOL\/YDAY/i);
  });
});
