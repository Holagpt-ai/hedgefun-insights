import { describe, expect, it } from "vitest";
import {
  assessScreenerGenerationSession,
  surveillanceTradingDateFromMs,
} from "@/lib/screeners/screener-session";
import { viewForActiveTab, validateGeneration } from "@/lib/screeners/contract";
import type { ScreenerFeedState, ScreenerResultRow } from "@/lib/screeners/contract";

describe("screener session alignment", () => {
  it("rolls surveillance trading date at 04:00 ET", () => {
    expect(surveillanceTradingDateFromMs(Date.parse("2026-09-24T04:00:00.000Z"))).toBe(
      "2026-09-23",
    );
    expect(surveillanceTradingDateFromMs(Date.parse("2026-09-24T08:10:00.000Z"))).toBe(
      "2026-09-24",
    );
  });

  it("rejects Sep 23 20:00 provider snapshot during Sep 24 pre-market", () => {
    const nowMs = Date.parse("2026-09-24T10:10:00.000Z"); // 06:10 ET
    const priorProvider = "2026-09-24T00:00:00.000Z"; // Sep 23 20:00 ET
    expect(
      assessScreenerGenerationSession({ nowMs, referenceIso: priorProvider }),
    ).toBe("previous_during_live");
  });

  it("viewForActiveTab hides rows when generation is a previous-session snapshot", () => {
    const nowMs = Date.parse("2026-09-24T10:10:00.000Z");
    const syncedAt = "2026-09-24T00:05:00.000Z";
    const providerAsOf = "2026-09-24T00:00:00.000Z";
    const RUN_ID = "11111111-1111-4111-8111-111111111111";
    const state: ScreenerFeedState = {
      state_key: "current",
      sync_run_id: RUN_ID,
      status: "available",
      synced_at: syncedAt,
      updated_at: syncedAt,
      provider_as_of_min: providerAsOf,
      provider_as_of_max: providerAsOf,
      rows_inserted: 1,
      tab_counts: {
        day_trade_radar: 1,
        gappers: 0,
        volume_spikes: 0,
        gainers_losers: 0,
        unusual_volume: 0,
        new_highs_lows: 0,
      },
      nhl_baseline_status: "available",
    };
    const row: ScreenerResultRow = {
      tab_id: "day_trade_radar",
      symbol: "BENF",
      company_name: "BENF",
      price: 4,
      change_percent: 12,
      volume: 1_000_000,
      avg_volume: null,
      rvol: null,
      float_shares: null,
      gap_percent: null,
      high_52w: null,
      low_52w: null,
      market_cap: null,
      prior_session_volume: 100_000,
      volume_ratio_prior_session: 10,
      avg_volume_20d: null,
      rvol_20d: null,
      day_high: 4.5,
      day_low: 3.5,
      range_event: null,
      provider_as_of: providerAsOf,
      sync_run_id: RUN_ID,
      updated_at: syncedAt,
    };
    const validated = validateGeneration([state], [row], nowMs);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const view = viewForActiveTab(validated.generation, "day_trade_radar", nowMs, 1);
    expect(view.status).toBe("unavailable");
    expect(view.rows).toHaveLength(0);
    expect(view.synced_at).toBe(syncedAt);
    expect(view.provider_as_of_max).toBe(providerAsOf);
  });
});
