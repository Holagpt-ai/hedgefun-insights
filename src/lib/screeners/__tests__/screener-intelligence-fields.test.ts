import { describe, expect, it } from "vitest";
import {
  resolveDailyRvol20d,
  resolveDollarVolume,
} from "@/lib/screeners/screener-intelligence-fields";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

function row(overrides: Partial<ScreenerResultRow & { avg_volume_20d?: number | null; rvol_20d?: number | null }> = {}): ScreenerResultRow & {
  avg_volume_20d?: number | null;
  rvol_20d?: number | null;
} {
  return {
    tab_id: "day_trade_radar",
    symbol: "AAA",
    company_name: null,
    price: 10,
    change_percent: 5,
    volume: 10_000_000,
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
    day_high: null,
    day_low: null,
    provider_as_of: "2026-09-17T16:00:00.000Z",
    sync_run_id: "00000000-0000-4000-8000-000000000001",
    updated_at: "2026-09-17T16:00:00.000Z",
    ...overrides,
  };
}

describe("screener intelligence display fields", () => {
  it("derives dollar volume from canonical price and volume", () => {
    expect(resolveDollarVolume(row({ price: 12, volume: 10_000_000 }))).toBe(120_000_000);
  });

  it("derives RVOL 20D when avg_volume_20d is supplied", () => {
    expect(resolveDailyRvol20d(row({ volume: 10_000_000, avg_volume_20d: 2_000_000 }))).toBe(5);
  });

  it("recomputes RVOL from sentinel volume even when donor snapshot differs", () => {
    expect(
      resolveDailyRvol20d(row({ volume: 10_000_000, avg_volume_20d: 2_000_000, rvol_20d: 3.5 })),
    ).toBe(5);
  });

  it("returns null RVOL when baseline is unavailable", () => {
    expect(resolveDailyRvol20d(row({ volume: 10_000_000, avg_volume_20d: null }))).toBe(null);
  });
});
