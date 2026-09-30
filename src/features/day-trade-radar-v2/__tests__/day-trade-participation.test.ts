import { describe, expect, it } from "vitest";
import {
  evaluateDayTradeEligibility,
  evaluateDayTradeParticipation,
  qualifiesDayTradeMomentum,
} from "@/features/day-trade-radar-v2/day-trade-strategy";
import { dayTradeRejectionReasons } from "@/features/day-trade-radar-v2/day-trade-qualification";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";

const NOW = Date.parse("2026-09-30T08:48:00.000Z");

function row(partial: Partial<RadarRankedRow>): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "ZZ",
    company_name: null,
    price: 5,
    change_percent: 20,
    volume: 2_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: 5_000_000,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 200_000,
    volume_ratio_prior_session: 10,
    avg_volume_20d: 2_500_000,
    rvol_20d: null,
    day_high: null,
    day_low: null,
    provider_as_of: "2026-09-30T08:00:00.000Z",
    sync_run_id: "run",
    updated_at: "2026-09-30T08:00:00.000Z",
    rank: 1,
    ...partial,
  } as RadarRankedRow;
}

describe("day trade multi-source participation", () => {
  it("price $5 move +20% float 5M classic 0.8 rvol5m 8.0 passes via rvol5m", () => {
    const candidate = row({
      price: 5,
      change_percent: 20,
      float_shares: 5_000_000,
      volume: 2_000_000,
      avg_volume_20d: 2_500_000,
      volume_ratio_prior_session: 0.8,
      rvol_5m: 8,
    });
    const evaluation = evaluateDayTradeParticipation(candidate);
    expect(evaluation.pass).toBe(true);
    expect(evaluation.winningSource).toBe("rvol_5m");
    expect(qualifiesDayTradeMomentum(candidate)).toBe(true);
  });

  it("strong rvol5m is not ignored when classic and Vol/Yday are weak", () => {
    const candidate = row({
      volume: 600_000,
      avg_volume_20d: 1_000_000,
      volume_ratio_prior_session: 0.8,
      rvol_5m: 10,
    });
    expect(evaluateDayTradeParticipation(candidate).pass).toBe(true);
  });

  it("weak metrics across sources fail INSUFFICIENT_RVOL", () => {
    const candidate = row({
      volume: 600_000,
      avg_volume_20d: 1_000_000,
      volume_ratio_prior_session: 0.6,
      rvol_5m: 1,
      time_adjusted_rvol: 0.5,
    });
    expect(evaluateDayTradeParticipation(candidate).pass).toBe(false);
    const reasons = dayTradeRejectionReasons(candidate, NOW);
    expect(reasons).toContain("INSUFFICIENT_RVOL");
    expect(reasons).not.toContain("MISSING_REQUIRED_DATA");
  });

  it("missing participation metrics map to missing-data reason", () => {
    const candidate = row({
      avg_volume_20d: null,
      volume_ratio_prior_session: null,
      prior_session_volume: null,
      rvol_5m: null,
      time_adjusted_rvol: null,
    });
    const reasons = dayTradeRejectionReasons(candidate, NOW);
    expect(reasons).toContain("MISSING_REQUIRED_DATA");
    expect(reasons).not.toContain("INSUFFICIENT_RVOL");
  });

  it("strong participation still fails on price above max", () => {
    const candidate = row({ price: 25, rvol_5m: 12 });
    expect(evaluateDayTradeParticipation(candidate).pass).toBe(true);
    expect(qualifiesDayTradeMomentum(candidate)).toBe(false);
    expect(dayTradeRejectionReasons(candidate, NOW)).toContain("PRICE_ABOVE_MAX");
  });

  it("strong participation still fails on weak momentum", () => {
    const candidate = row({ change_percent: 4, rvol_5m: 12 });
    expect(dayTradeRejectionReasons(candidate, NOW)).toContain("MOMENTUM_TOO_WEAK");
  });

  it("high float still rejects", () => {
    const candidate = row({ float_shares: 20_000_000, rvol_5m: 12 });
    expect(evaluateDayTradeEligibility(candidate).floatGate).toBe("fail_high_float");
    expect(dayTradeRejectionReasons(candidate, NOW)).toContain("FLOAT_TOO_HIGH");
  });
});
