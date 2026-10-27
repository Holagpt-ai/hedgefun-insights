import { describe, expect, it } from "vitest";
import {
  validateGeneration,
  type ScreenerFeedState,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";
import { reconcilePublicationTabEvidence } from "@/lib/screeners/publication-evidence-reconcile";
import { resolveScreenerTruthState } from "@/lib/screeners/screener-truth-state";
import { parseTabEvaluationEvidencePartial } from "@/lib/screeners/tab-evaluation-evidence";

const SYNC = "11111111-1111-4111-8111-111111111111";
const SYNCED = "2026-10-27T12:10:00.000Z";
const PROVIDER = "2026-10-27T12:09:00.000Z";
const NOW = Date.parse("2026-10-27T12:15:00.000Z");

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
    sync_run_id: SYNC,
    status: "available",
    synced_at: SYNCED,
    updated_at: SYNCED,
    provider_as_of_min: PROVIDER,
    provider_as_of_max: PROVIDER,
    rows_inserted: 1,
    tab_counts: { ...emptyCounts(), gainers_losers: 1 },
    nhl_baseline_status: "available",
    tab_evaluation_evidence: null,
    ...overrides,
  };
}

function gainersRow(symbol: string): ScreenerResultRow {
  return {
    tab_id: "gainers_losers",
    symbol,
    company_name: symbol,
    price: 10,
    change_percent: 12,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: null,
    day_low: null,
    range_event: null,
    provider_as_of: PROVIDER,
    sync_run_id: SYNC,
    updated_at: SYNCED,
  };
}

describe("Batch 185 — publication evidence reconcile", () => {
  it("derives gainers_losers evaluated evidence from published rows when column is null", () => {
    const rows = [gainersRow("BRAI")];
    const reconciled = reconcilePublicationTabEvidence({
      state: state(),
      rows,
      evidence: null,
    });
    expect(reconciled?.gainers_losers).toMatchObject({
      status: "evaluated",
      selected_count: 1,
      qualified_count: 1,
    });

    const truth = resolveScreenerTruthState({
      tabId: "gainers_losers",
      status: "available",
      rowCount: 1,
      syncedAt: SYNCED,
      tabEvaluationEvidence: reconciled,
      source: "screener-results",
    });
    expect(truth.reason).toBe("evaluated_with_results");
  });

  it("validateGeneration attaches reconciled evidence for null tab_evaluation_evidence", () => {
    const rows = [gainersRow("AXG")];
    const outcome = validateGeneration([state()], rows, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.generation.tab_evaluation_evidence?.gainers_losers?.status).toBe(
      "evaluated",
    );
  });

  it("parseTabEvaluationEvidencePartial keeps valid tabs when one tab payload is malformed", () => {
    const partial = parseTabEvaluationEvidencePartial({
      gainers_losers: {
        status: "evaluated",
        universe_count: 400,
        qualified_count: 2,
        selected_count: 2,
      },
      gappers: {
        status: "evaluated",
        universe_count: 100,
        gap_calculable_count: 100,
        qualified_count: 0,
        selected_count: 0,
      },
    });
    expect(partial?.gainers_losers).toBeTruthy();
    expect(partial?.gappers).toBeUndefined();
  });
});
