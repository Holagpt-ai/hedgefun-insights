import { describe, expect, it } from "vitest";
import {
  isGenerationStale,
  SCREENER_STALE_AFTER_MS,
  unavailableView,
  validateGeneration,
  viewForActiveTab,
  type ScreenerFeedState,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";
import { resolveScreenerTruthState } from "@/lib/screeners/screener-truth-state";

const NOW = Date.parse("2026-09-14T20:40:00.000Z");
const SYNCED = "2026-09-14T20:35:00.000Z";
const PROVIDER = "2026-09-14T20:34:00.000Z";
const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function emptyCounts() {
  return {
    day_trade_radar: 0,
    gappers: 0,
    volume_spikes: 0,
    gainers_losers: 0,
    unusual_volume: 0,
    new_highs_lows: 0,
  };
}

function state(overrides: Partial<ScreenerFeedState> = {}): ScreenerFeedState {
  return {
    state_key: "current",
    sync_run_id: RUN_ID,
    status: "available",
    synced_at: SYNCED,
    provider_as_of_min: PROVIDER,
    provider_as_of_max: PROVIDER,
    rows_inserted: 0,
    tab_counts: emptyCounts(),
    nhl_baseline_status: "available",
    tab_evaluation_evidence: null,
    updated_at: SYNCED,
    ...overrides,
  };
}

function gapperRow(symbol: string, gap: number, volume: number): ScreenerResultRow {
  return {
    tab_id: "gappers",
    symbol,
    company_name: symbol,
    price: 10,
    change_percent: null,
    volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: gap,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 10.5,
    day_low: 9.5,
    provider_as_of: PROVIDER,
    sync_run_id: RUN_ID,
    updated_at: SYNCED,
  };
}

describe("screener truth-state resolver", () => {
  it("gappers: empty universe evidence does not claim validated zero-match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "prerequisite_unavailable",
          universe_count: 0,
          volume_positive_count: 0,
          gap_calculable_count: 0,
          qualified_count: 0,
          selected_count: 0,
          reason: "upstream_universe_empty",
        },
      },
    });
    expect(truth.reason).toBe("prerequisite_unavailable");
  });

  it("gappers: sufficient coverage with zero qualified → validated zero-match copy", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "evaluated",
          universe_count: 500,
          volume_positive_count: 480,
          gap_calculable_count: 480,
          no_prior_session_count: 0,
          unresolved_gap_input_count: 0,
          qualified_count: 0,
          selected_count: 0,
        },
      },
    });
    expect(truth.reason).toBe("validated_zero_matches");
    expect(truth.explanation).toContain("No securities met this screener");
  });

  it("gappers: old evidence lacking accounting fields cannot certify zero", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "evaluated",
          universe_count: 500,
          volume_positive_count: 480,
          gap_calculable_count: 480,
          qualified_count: 0,
          selected_count: 0,
        },
      },
    });
    expect(truth.reason).not.toBe("validated_zero_matches");
  });

  it("gappers: zero calculable rows does not claim validated zero-match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "prerequisite_unavailable",
          universe_count: 500,
          volume_positive_count: 480,
          gap_calculable_count: 0,
          qualified_count: 0,
          selected_count: 0,
          reason: "prior_close_gap_inputs_unavailable",
        },
      },
    });
    expect(truth.reason).toBe("prerequisite_unavailable");
    expect(truth.reason).not.toBe("validated_zero_matches");
  });

  it("gappers: no volume-active universe does not claim validated zero-match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "prerequisite_unavailable",
          universe_count: 500,
          volume_positive_count: 0,
          gap_calculable_count: 0,
          qualified_count: 0,
          selected_count: 0,
          reason: "no_volume_active_universe",
        },
      },
    });
    expect(truth.reason).toBe("prerequisite_unavailable");
  });

  it("gappers: selected_count mismatch blocks validated zero-match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "evaluated",
          universe_count: 500,
          volume_positive_count: 480,
          gap_calculable_count: 480,
          qualified_count: 0,
          selected_count: 5,
        },
      },
    });
    expect(truth.reason).toBe("evaluation_evidence_missing");
  });

  it("gappers: incomplete coverage → prerequisite-unavailable copy", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "prerequisite_unavailable",
          universe_count: 500,
          volume_positive_count: 480,
          gap_calculable_count: 120,
          qualified_count: 0,
          selected_count: 0,
          reason: "gap_input_coverage_incomplete",
        },
      },
    });
    expect(truth.reason).toBe("prerequisite_unavailable");
    expect(truth.explanation).toContain("Prior-close and gap inputs were unavailable");
  });

  it("gappers: 20 valid rows → available with results", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "available",
      rowCount: 20,
      syncedAt: SYNCED,
      tabEvaluationEvidence: {
        gappers: {
          status: "evaluated",
          universe_count: 900,
          volume_positive_count: 880,
          gap_calculable_count: 880,
          qualified_count: 40,
          selected_count: 20,
        },
      },
    });
    expect(truth.reason).toBe("evaluated_with_results");
    expect(truth.showRows).toBe(true);
  });

  it("new highs/lows: evaluated_count=0 never resolves to validated zero-match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "not_evaluated",
          baseline_status: "available",
          baseline_quote_count: 100,
          universe_count: 800,
          evaluated_count: 0,
          qualified_count: 0,
          selected_count: 0,
          reason: "baseline_coverage_empty",
        },
      },
    });
    expect(truth.reason).not.toBe("validated_zero_matches");
    expect(truth.reason).toBe("evaluation_evidence_missing");
  });

  it("new highs/lows: available baseline with zero loaded rows does not claim validated zero", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "initializing",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "not_evaluated",
          baseline_status: "initializing",
          baseline_quote_count: 0,
          universe_count: 800,
          selected_count: 0,
          reason: "baseline_quotes_empty",
        },
      },
    });
    expect(truth.reason).toBe("baseline_initializing");
    expect(truth.reason).not.toBe("validated_zero_matches");
  });

  it("new highs/lows: partial baseline evidence does not block row display", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "available",
      rowCount: 2,
      syncedAt: SYNCED,
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "not_evaluated",
          baseline_status: "available",
          baseline_quote_count: 700,
          universe_count: 800,
          eligible_count: 800,
          evaluated_count: 400,
          qualified_count: 2,
          selected_count: 2,
          reason: "baseline_coverage_incomplete",
        },
      },
    });
    expect(truth.reason).toBe("evaluated_with_results");
    expect(truth.showRows).toBe(true);
  });

  it("new highs/lows: incomplete eligible coverage blocks validated zero-match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "not_evaluated",
          baseline_status: "available",
          baseline_quote_count: 700,
          universe_count: 800,
          eligible_count: 800,
          evaluated_count: 400,
          qualified_count: 0,
          selected_count: 0,
          reason: "baseline_coverage_incomplete",
        },
      },
    });
    expect(truth.reason).toBe("evaluation_evidence_missing");
  });

  it("new highs/lows: empty baseline quotes do not claim baseline-ready zero-match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "initializing",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "not_evaluated",
          baseline_status: "initializing",
          baseline_quote_count: 0,
          universe_count: 0,
          selected_count: 0,
          reason: "baseline_quotes_empty",
        },
      },
    });
    expect(truth.reason).toBe("baseline_initializing");
  });

  it("new highs/lows: baseline available + meaningful evaluated coverage + zero qualified", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 700,
          universe_count: 800,
          eligible_count: 700,
          evaluated_count: 700,
          policy_excluded_count: 0,
          unresolved_count: 0,
          qualified_count: 0,
          selected_count: 0,
        },
      },
    });
    expect(truth.reason).toBe("validated_zero_matches");
    expect(truth.explanation).toContain("sufficient validated baseline history");
  });

  it("new highs/lows: old evidence lacking accounting fields cannot certify zero", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 700,
          universe_count: 800,
          eligible_count: 700,
          evaluated_count: 700,
          qualified_count: 0,
          selected_count: 0,
        },
      },
    });
    expect(truth.reason).not.toBe("validated_zero_matches");
  });

  it("new highs/lows: baseline initializing → initializing", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "initializing",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "initializing",
    });
    expect(truth.reason).toBe("baseline_initializing");
  });

  it("new highs/lows: baseline unavailable → unavailable", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "unavailable",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "unavailable",
    });
    expect(truth.reason).toBe("baseline_unavailable");
  });

  it("new highs/lows: row count alone cannot override baseline status", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "initializing",
      rowCount: 5,
      syncedAt: SYNCED,
      nhlBaselineStatus: "initializing",
    });
    expect(truth.reason).toBe("baseline_initializing");
    expect(truth.showRows).toBe(false);
  });

  it("stale: available-with-rows transitions to generation_stale metadata", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "stale",
      rowCount: 3,
      syncedAt: SYNCED,
    });
    expect(truth.status).toBe("stale");
    expect(truth.reason).toBe("generation_stale");
    expect(truth.showRows).toBe(true);
    expect(truth.reason).not.toBe("evaluated_with_results");
  });

  it("stale: empty transitions to generation_stale without showing rows", () => {
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "stale",
      rowCount: 0,
      syncedAt: SYNCED,
    });
    expect(truth.status).toBe("stale");
    expect(truth.reason).toBe("generation_stale");
    expect(truth.showRows).toBe(false);
    expect(truth.reason).not.toBe("validated_zero_matches");
  });

  it("generic feed: query failure → unavailable", () => {
    const truth = resolveScreenerTruthState({
      tabId: "volume_spikes",
      status: "unavailable",
      rowCount: 0,
      syncedAt: null,
    });
    expect(truth.reason).toBe("generation_unavailable");
  });

  it("generic feed: generation mismatch → unavailable via validation", () => {
    const out = validateGeneration(
      [
        state({
          status: "empty",
          rows_inserted: 0,
          tab_counts: emptyCounts(),
          provider_as_of_min: null,
          provider_as_of_max: null,
          tab_evaluation_evidence: {
            gappers: {
              status: "evaluated",
              universe_count: 1,
              volume_positive_count: 1,
              gap_calculable_count: 1,
              qualified_count: 0,
              selected_count: 99,
            },
          },
        }),
      ],
      [],
      NOW,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("tab_evaluation_selected_count_mismatch");
  });

  it("viewForActiveTab attaches evaluation evidence for downstream truth resolution", () => {
    const evidence = {
      gappers: {
        status: "evaluated" as const,
        universe_count: 100,
        volume_positive_count: 95,
        gap_calculable_count: 95,
        no_prior_session_count: 0,
        unresolved_gap_input_count: 0,
        qualified_count: 0,
        selected_count: 0,
      },
    };
    const validated = validateGeneration(
      [
        state({
          status: "empty",
          rows_inserted: 0,
          tab_counts: emptyCounts(),
          provider_as_of_min: null,
          provider_as_of_max: null,
          tab_evaluation_evidence: evidence,
        }),
      ],
      [],
      NOW,
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const view = viewForActiveTab(validated.generation, "gappers", NOW, 1);
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: view.status,
      rowCount: view.rows.length,
      syncedAt: view.synced_at,
      tabEvaluationEvidence: view.tab_evaluation_evidence,
    });
    expect(truth.reason).toBe("validated_zero_matches");
  });

  it("unavailable view stays honest when generation cannot be loaded", () => {
    const view = unavailableView(2);
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: view.status,
      rowCount: view.rows.length,
      syncedAt: view.synced_at,
    });
    expect(truth.reason).toBe("generation_unavailable");
    expect(truth.showRows).toBe(false);
  });

  it("generic feed: stale validated rows remain visible with stale disclosure", () => {
    const staleSynced = new Date(NOW - SCREENER_STALE_AFTER_MS - 60_000).toISOString();
    expect(isGenerationStale(staleSynced, NOW)).toBe(true);
    const truth = resolveScreenerTruthState({
      tabId: "gappers",
      status: "stale",
      rowCount: 2,
      syncedAt: staleSynced,
      tabEvaluationEvidence: {
        gappers: {
          status: "evaluated",
          universe_count: 100,
          volume_positive_count: 100,
          gap_calculable_count: 100,
          qualified_count: 2,
          selected_count: 2,
        },
      },
    });
    expect(truth.reason).toBe("generation_stale");
    expect(truth.showRows).toBe(true);
  });
});
