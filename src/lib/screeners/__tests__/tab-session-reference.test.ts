import { describe, expect, it } from "vitest";
import {
  filterActiveTabRowsForCurrentSession,
  newestProviderAsOfForTabRows,
  resolveActiveTabSessionReference,
} from "@/lib/screeners/tab-session-reference";
import { viewForActiveTab, validateGeneration, type ScreenerFeedState, type ScreenerResultRow } from "@/lib/screeners/contract";

describe("tab session reference", () => {
  const nowMs = Date.parse("2026-11-27T19:00:00.000Z"); // 2:00 PM ET early-close RTH

  it("prefers newest provider_as_of on the active tab", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs,
      activeTabId: "new_highs_lows",
      rows: [
        { tab_id: "gappers", provider_as_of: "2026-11-27T15:00:00.000Z" },
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-26T21:00:00.000Z" },
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-27T18:30:00.000Z" },
      ],
      providerAsOfMax: "2026-11-27T18:30:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 100,
          universe_count: 100,
          selected_count: 0,
        },
      },
    });
    expect(newestProviderAsOfForTabRows(
      [
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-27T18:30:00.000Z" },
      ],
      "new_highs_lows",
    )).toBe("2026-11-27T18:30:00.000Z");
    expect(ref).toBe("2026-11-27T18:30:00.000Z");
  });

  it("does not promote prior-session rows via current synced_at publication time", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs,
      activeTabId: "new_highs_lows",
      rows: [
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-26T21:00:00.000Z" },
      ],
      providerAsOfMax: "2026-11-26T21:00:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 100,
          universe_count: 100,
          selected_count: 1,
        },
      },
    });
    expect(ref).toBe("2026-11-26T21:00:00.000Z");
  });

  it("allows evaluated-empty current session only via current provider_as_of_max", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs,
      activeTabId: "new_highs_lows",
      rows: [],
      providerAsOfMax: "2026-11-27T18:30:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 100,
          universe_count: 100,
          selected_count: 0,
        },
      },
    });
    expect(ref).toBe("2026-11-27T18:30:00.000Z");
  });

  it("viewForActiveTab withholds stale nonempty rows even when tab evaluated and synced_at is current", () => {
    const syncedAt = "2026-11-27T18:45:00.000Z";
    const providerAsOf = "2026-11-26T21:00:00.000Z";
    const RUN_ID = "33333333-3333-4333-8333-333333333333";
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
        day_trade_radar: 0,
        gappers: 0,
        volume_spikes: 0,
        gainers_losers: 0,
        unusual_volume: 0,
        new_highs_lows: 1,
      },
      nhl_baseline_status: "available",
      tab_evaluation_evidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 100,
          universe_count: 100,
          selected_count: 1,
        },
      },
    };
    const nhlRow: ScreenerResultRow = {
      tab_id: "new_highs_lows",
      symbol: "STALE",
      company_name: "STALE",
      price: 10,
      change_percent: 5,
      volume: 500_000,
      avg_volume: null,
      rvol: null,
      float_shares: null,
      gap_percent: null,
      high_52w: 9.5,
      low_52w: 5,
      range_event: "new_high",
      market_cap: null,
      prior_session_volume: null,
      volume_ratio_prior_session: null,
      avg_volume_20d: null,
      rvol_20d: null,
      day_high: 10,
      day_low: 9.5,
      provider_as_of: providerAsOf,
      sync_run_id: RUN_ID,
      updated_at: syncedAt,
    };
    const validated = validateGeneration([state], [nhlRow], nowMs);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const view = viewForActiveTab(validated.generation, "new_highs_lows", nowMs, 1);
    expect(view.status).toBe("unavailable");
    expect(view.rows).toHaveLength(0);
  });

  it("filters mixed tab rows to current-session observations only", () => {
    const prior = "2026-11-26T21:00:00.000Z";
    const current = "2026-11-27T18:30:00.000Z";
  const rows = [
      { tab_id: "gappers", provider_as_of: prior, symbol: "OLD" },
      { tab_id: "gappers", provider_as_of: current, symbol: "NEW" },
    ];
    const filtered = filterActiveTabRowsForCurrentSession(rows, "gappers", nowMs);
    expect(filtered.map((r) => r.symbol)).toEqual(["NEW"]);
  });
});