import { describe, expect, it } from "vitest";
import { overlayCanonicalIntradayMetrics } from "@/lib/screeners/screener-radar-intraday-overlay";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

function screenerRow(partial: Partial<ScreenerResultRow>): ScreenerResultRow {
  return {
    tab_id: "gappers",
    symbol: "ABC",
    company_name: "ABC",
    price: 10,
    change_percent: 8,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: 8,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    avg_volume_20d: null,
    rvol_20d: null,
    day_high: null,
    day_low: null,
    provider_as_of: "2026-09-30T14:00:00.000Z",
    sync_run_id: "run",
    updated_at: "2026-09-30T14:00:00.000Z",
    ...partial,
  };
}

describe("canonical intraday overlay", () => {
  it("gappers receives rvol_5m from radar donor on same session", () => {
    const [merged] = overlayCanonicalIntradayMetrics(
      [screenerRow({ symbol: "ABC" })],
      [
        {
          symbol: "ABC",
          provider_as_of: "2026-09-30T14:05:00.000Z",
          rvol_5m: 6.2,
          vol_velocity: null,
          time_adjusted_rvol: null,
          volume_acceleration_pct: null,
        },
      ],
    );
    expect((merged as { rvol_5m?: number | null }).rvol_5m).toBe(6.2);
  });

  it("volume spikes path keeps existing rvol_5m when already set", () => {
    const base = screenerRow({ tab_id: "volume_spikes" }) as ScreenerResultRow & {
      rvol_5m: number;
    };
    base.rvol_5m = 4.1;
    const [merged] = overlayCanonicalIntradayMetrics(
      [base],
      [
        {
          symbol: "ABC",
          provider_as_of: "2026-09-30T14:05:00.000Z",
          rvol_5m: 9.9,
          vol_velocity: null,
          time_adjusted_rvol: null,
          volume_acceleration_pct: null,
        },
      ],
    );
    expect((merged as { rvol_5m?: number | null }).rvol_5m).toBe(4.1);
  });
});
