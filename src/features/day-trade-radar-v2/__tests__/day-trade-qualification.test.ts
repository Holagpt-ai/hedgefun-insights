import { describe, expect, it } from "vitest";
import { dayTradeRejectionReasons } from "@/features/day-trade-radar-v2/day-trade-qualification";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";

const NOW = Date.parse("2026-09-30T08:48:00.000Z");

function row(partial: Partial<RadarRankedRow>): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "ZZ",
    company_name: null,
    price: 5,
    change_percent: 12,
    volume: 2_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: 1_000_000,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 200_000,
    volume_ratio_prior_session: 10,
    avg_volume_20d: null,
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

describe("day trade qualification funnel", () => {
  it("rejects sub-dollar names for the main desk preset", () => {
    const reasons = dayTradeRejectionReasons(row({ price: 0.75, change_percent: 20 }), NOW);
    expect(reasons).toContain("PRICE_BELOW_MIN");
  });

  it("does not block penny preset eligibility globally", () => {
    const reasons = dayTradeRejectionReasons(row({ price: 0.75, change_percent: 20 }), NOW);
    expect(reasons).not.toContain("PRICE_ABOVE_MAX");
  });

  it("aggregates insufficient rvol separately from missing data", () => {
    const reasons = dayTradeRejectionReasons(
      row({ volume_ratio_prior_session: 0.5, rvol_5m: null, time_adjusted_rvol: null }),
      NOW,
    );
    expect(reasons).toContain("INSUFFICIENT_RVOL");
  });
});
