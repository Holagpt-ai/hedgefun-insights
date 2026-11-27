import { describe, expect, it } from "vitest";
import {
  filterActiveTabRowsForCurrentSession,
  newestProviderAsOfForTabRows,
  resolveActiveTabSessionReference,
} from "@/lib/screeners/tab-session-reference";
import {
  viewForActiveTab,
  validateGeneration,
  type ScreenerFeedState,
  type ScreenerResultRow,
  type ValidatedGeneration,
} from "@/lib/screeners/contract";

const NHL_ZERO_EVIDENCE = {
  status: "evaluated" as const,
  baseline_status: "available" as const,
  baseline_quote_count: 700,
  universe_count: 800,
  eligible_count: 700,
  evaluated_count: 600,
  policy_excluded_count: 100,
  no_history_count: 0,
  unresolved_count: 0,
  qualified_count: 0,
  selected_count: 0,
};

describe("tab session reference", () => {
  const liveEarlyCloseMs = Date.parse("2026-11-27T19:00:00.000Z"); // 2:00 PM ET early-close RTH

  it("prefers newest provider_as_of on the active tab", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs: liveEarlyCloseMs,
      activeTabId: "new_highs_lows",
      rows: [
        { tab_id: "gappers", provider_as_of: "2026-11-27T15:00:00.000Z" },
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-26T21:00:00.000Z" },
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-27T18:30:00.000Z" },
      ],
      providerAsOfMax: "2026-11-27T18:30:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: NHL_ZERO_EVIDENCE,
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
      nowMs: liveEarlyCloseMs,
      activeTabId: "new_highs_lows",
      rows: [
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-26T21:00:00.000Z" },
      ],
      providerAsOfMax: "2026-11-26T21:00:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: {
          ...NHL_ZERO_EVIDENCE,
          selected_count: 1,
        },
      },
    });
    expect(ref).toBe("2026-11-26T21:00:00.000Z");
  });

  it("allows evaluated-empty current session only with full zero-match evidence", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs: liveEarlyCloseMs,
      activeTabId: "new_highs_lows",
      rows: [],
      providerAsOfMax: "2026-11-27T18:30:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: NHL_ZERO_EVIDENCE,
      },
    });
    expect(ref).toBe("2026-11-27T18:30:00.000Z");
  });

  it("rejects publication-confirmed-only evidence for evaluated-empty session reference", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs: liveEarlyCloseMs,
      activeTabId: "volume_spikes",
      rows: [],
      providerAsOfMax: "2026-11-27T18:30:00.000Z",
      tabEvaluationEvidence: {
        volume_spikes: { status: "publication_confirmed", published_count: 0 },
      },
    });
    expect(ref).toBeNull();
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
          ...NHL_ZERO_EVIDENCE,
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
    const validated = validateGeneration([state], [nhlRow], liveEarlyCloseMs);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const view = viewForActiveTab(validated.generation, "new_highs_lows", liveEarlyCloseMs, 1);
    expect(view.status).toBe("unavailable");
    expect(view.rows).toHaveLength(0);
  });

  it("filters mixed tab rows to current-session observations only during live surveillance", () => {
    const prior = "2026-11-26T21:00:00.000Z";
    const current = "2026-11-27T18:30:00.000Z";
    const rows = [
      { tab_id: "gappers", provider_as_of: prior, symbol: "OLD" },
      { tab_id: "gappers", provider_as_of: current, symbol: "NEW" },
    ];
    const filtered = filterActiveTabRowsForCurrentSession(rows, "gappers", liveEarlyCloseMs);
    expect(filtered.map((r) => r.symbol)).toEqual(["NEW"]);
  });

  it("preserves prior-session rows on closed markets (weekend)", () => {
    const prior = "2026-11-26T21:00:00.000Z";
    const weekendMs = Date.parse("2026-11-28T22:00:00.000Z"); // Saturday evening ET
    const rows = [
      { tab_id: "gappers", provider_as_of: prior, symbol: "PRESERVED" },
    ];
    expect(filterActiveTabRowsForCurrentSession(rows, "gappers", weekendMs)).toHaveLength(1);
  });

  it("preserves prior-session rows overnight before premarket", () => {
    const prior = "2026-11-25T21:00:00.000Z";
    const overnightMs = Date.parse("2026-11-26T08:00:00.000Z"); // 3:00 AM ET (closed; Thanksgiving calendar)
    const rows = [{ tab_id: "volume_spikes", provider_as_of: prior, symbol: "SNAP" }];
    expect(
      filterActiveTabRowsForCurrentSession(rows, "volume_spikes", overnightMs),
    ).toHaveLength(1);
  });

  it("withholds live evaluated-empty when zero-match evidence lacks current observation (prior provider_as_of_max)", () => {
    const syncedAt = "2026-11-27T18:45:00.000Z";
    const priorProvider = "2026-11-26T21:00:00.000Z";
    const RUN_ID = "55555555-5555-4555-8555-555555555555";
    const state: ScreenerFeedState = {
      state_key: "current",
      sync_run_id: RUN_ID,
      status: "available",
      synced_at: syncedAt,
      updated_at: syncedAt,
      provider_as_of_min: priorProvider,
      provider_as_of_max: priorProvider,
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
      tab_evaluation_evidence: {
        new_highs_lows: NHL_ZERO_EVIDENCE,
      },
    };
    const radarRow: ScreenerResultRow = {
      tab_id: "day_trade_radar",
      symbol: "RAD1",
      company_name: "RAD1",
      price: 5,
      change_percent: 1,
      volume: 1_000_000,
      avg_volume: null,
      rvol: null,
      float_shares: null,
      gap_percent: null,
      high_52w: null,
      low_52w: null,
      range_event: null,
      market_cap: null,
      prior_session_volume: 100_000,
      volume_ratio_prior_session: 10,
      avg_volume_20d: null,
      rvol_20d: null,
      day_high: 5.5,
      day_low: 4.5,
      provider_as_of: priorProvider,
      sync_run_id: RUN_ID,
      updated_at: syncedAt,
    };
    const validated = validateGeneration([state], [radarRow], liveEarlyCloseMs);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const view = viewForActiveTab(validated.generation, "new_highs_lows", liveEarlyCloseMs, 1);
    expect(view.status).toBe("unavailable");
    expect(view.rows).toHaveLength(0);
  });

  it("withholds live evaluated-empty when zero-match evidence lacks current observation (missing provider_as_of_max)", () => {
    const syncedAt = "2026-11-27T18:45:00.000Z";
    const generation: ValidatedGeneration = {
      status: "available",
      state: {
        state_key: "current",
        sync_run_id: "66666666-6666-4666-8666-666666666666",
        status: "available",
        synced_at: syncedAt,
        updated_at: syncedAt,
        provider_as_of_min: null,
        provider_as_of_max: null,
        rows_inserted: 0,
        tab_counts: {
          day_trade_radar: 0,
          gappers: 0,
          volume_spikes: 0,
          gainers_losers: 0,
          unusual_volume: 0,
          new_highs_lows: 0,
        },
        nhl_baseline_status: "available",
        tab_evaluation_evidence: {
          new_highs_lows: NHL_ZERO_EVIDENCE,
        },
      },
      rows: [],
      synced_at: syncedAt,
      provider_as_of_max: null,
      provider_as_of_min: null,
      tab_evaluation_evidence: {
        new_highs_lows: NHL_ZERO_EVIDENCE,
      },
    };
    const view = viewForActiveTab(generation, "new_highs_lows", liveEarlyCloseMs, 1);
    expect(view.status).toBe("unavailable");
  });

  it("viewForActiveTab shows unavailable for live empty tab without zero-match evidence", () => {
    const syncedAt = "2026-11-27T18:45:00.000Z";
    const providerAsOf = "2026-11-27T18:30:00.000Z";
    const RUN_ID = "44444444-4444-4444-8444-444444444444";
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
      tab_evaluation_evidence: {
        volume_spikes: { status: "publication_confirmed", published_count: 0 },
      },
    };
    const radarRow: ScreenerResultRow = {
      tab_id: "day_trade_radar",
      symbol: "RAD1",
      company_name: "RAD1",
      price: 5,
      change_percent: 1,
      volume: 1_000_000,
      avg_volume: null,
      rvol: null,
      float_shares: null,
      gap_percent: null,
      high_52w: null,
      low_52w: null,
      range_event: null,
      market_cap: null,
      prior_session_volume: 100_000,
      volume_ratio_prior_session: 10,
      avg_volume_20d: null,
      rvol_20d: null,
      day_high: 5.5,
      day_low: 4.5,
      provider_as_of: providerAsOf,
      sync_run_id: RUN_ID,
      updated_at: syncedAt,
    };
    const validated = validateGeneration([state], [radarRow], liveEarlyCloseMs);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const view = viewForActiveTab(validated.generation, "volume_spikes", liveEarlyCloseMs, 1);
    expect(view.status).toBe("unavailable");
  });
});