import { describe, expect, it } from "vitest";
import {
  validateGeneration,
  type ScreenerFeedState,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";
import { reconcilePublicationTabEvidence } from "@/lib/screeners/publication-evidence-reconcile";
import { resolveScreenerTruthState } from "@/lib/screeners/screener-truth-state";
import {
  parseTabEvaluationEvidencePartial,
  type TabEvaluationEvidenceMap,
} from "@/lib/screeners/tab-evaluation-evidence";

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

function radarRow(symbol: string): ScreenerResultRow {
  return {
    ...gainersRow(symbol),
    tab_id: "day_trade_radar",
    prior_session_volume: 500_000,
    volume_ratio_prior_session: 2,
    day_high: 11,
    day_low: 9,
  };
}

describe("Batch 185.1 — publication evidence honesty (Oct 27 regression fixtures)", () => {
  it("1) Gainers/Losers rows + null evidence → publication-confirmed rows, not full evaluation", () => {
    const rows = [gainersRow("BRAI")];
    const reconciled = reconcilePublicationTabEvidence({
      state: state(),
      rows,
      evidence: null,
    });
    expect(reconciled?.gainers_losers).toEqual({
      status: "publication_confirmed",
      published_count: 1,
    });
    expect(reconciled?.gainers_losers).not.toHaveProperty("universe_count");

    const truth = resolveScreenerTruthState({
      tabId: "gainers_losers",
      status: "available",
      rowCount: 1,
      syncedAt: SYNCED,
      tabEvaluationEvidence: reconciled,
      source: "screener-results",
    });
    expect(truth.reason).toBe("publication_confirmed_results");
    expect(truth.showRows).toBe(true);
    expect(truth.advisory).toMatch(/5-argument replace RPC/);
  });

  it("2) Other tabs have rows, G/L zero + null evidence → empty G/L stays evidence missing (Oct 27 screen)", () => {
    const rows = [radarRow("AXG")];
    const feedState = state({
      rows_inserted: 1,
      tab_counts: { ...emptyCounts(), day_trade_radar: 1 },
    });
    const reconciled = reconcilePublicationTabEvidence({
      state: feedState,
      rows,
      evidence: null,
    });
    expect(reconciled?.gainers_losers).toBeUndefined();

    const truth = resolveScreenerTruthState({
      tabId: "gainers_losers",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      tabEvaluationEvidence: reconciled,
      source: "screener-results",
    });
    expect(truth.reason).toBe("evaluation_evidence_missing");
    expect(truth.title).toBe("Evaluation evidence unavailable");
  });

  it("3) NHL zero rows, baseline available, missing evidence → not a verified zero match", () => {
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: null,
      source: "screener-results",
    });
    expect(truth.reason).toBe("evaluation_evidence_missing");
    expect(truth.reason).not.toBe("validated_zero_matches");
  });

  it("4) NHL provider evaluation evidence supports genuine zero-match", () => {
    const evidence: TabEvaluationEvidenceMap = {
      new_highs_lows: {
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 500,
        universe_count: 400,
        eligible_count: 50,
        evaluated_count: 48,
        policy_excluded_count: 1,
        no_history_count: 1,
        unresolved_count: 0,
        qualified_count: 0,
        selected_count: 0,
      },
    };
    const truth = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "empty",
      rowCount: 0,
      syncedAt: SYNCED,
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: evidence,
      source: "screener-results",
    });
    expect(truth.reason).toBe("validated_zero_matches");
    expect(truth.title).toBe("Baseline ready");
  });

  it("5) malformed gappers evidence skipped; valid gainers evidence retained", () => {
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

  it("validateGeneration attaches publication_confirmed only for tabs with published rows", () => {
    const rows = [gainersRow("XXII")];
    const outcome = validateGeneration([state()], rows, NOW);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.generation.tab_evaluation_evidence?.gainers_losers).toEqual({
      status: "publication_confirmed",
      published_count: 1,
    });
  });

  it("does not infer universe counts from tab_counts when reconciling", () => {
    const rows = [gainersRow("CLRO")];
    const reconciled = reconcilePublicationTabEvidence({
      state: state({ tab_counts: { ...emptyCounts(), gainers_losers: 20 } }),
      rows,
      evidence: null,
    });
    expect(
      reconciled?.gainers_losers &&
        "published_count" in reconciled.gainers_losers &&
        reconciled.gainers_losers.published_count,
    ).toBe(1);
    expect(reconciled?.gainers_losers).not.toHaveProperty("qualified_count");
  });
});
