/**
 * Reattach compact evaluation evidence from a validated published generation
 * when feed_state.tab_evaluation_evidence is null (RPC fallback / pre-column rollout).
 * Does not invent quotes, gaps, or rows — only counts/metadata implied by published rows.
 */

import {
  MANAGED_TAB_IDS,
  NHL_TAB_ID,
  parseNhlBaselineStatus,
  parseTabCounts,
  type ManagedTabId,
  type ScreenerFeedState,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";
import type {
  GappersTabEvidence,
  GenericTabEvidence,
  NhlTabEvidence,
  TabEvaluationEvidenceMap,
} from "@/lib/screeners/tab-evaluation-evidence";

function genericFromPublication(
  tabRows: readonly ScreenerResultRow[],
  tabCount: number,
): GenericTabEvidence {
  const selected = tabRows.length;
  return {
    status: "evaluated",
    universe_count: Math.max(tabCount, selected),
    qualified_count: selected,
    selected_count: selected,
  };
}

function gappersFromPublication(
  tabRows: readonly ScreenerResultRow[],
  tabCount: number,
): GappersTabEvidence | null {
  if (tabRows.length === 0) return null;
  const volumePositive = tabRows.filter(
    (row) => typeof row.volume === "number" && row.volume > 0,
  );
  const calculable = tabRows.filter(
    (row) =>
      typeof row.gap_percent === "number" &&
      Number.isFinite(row.gap_percent) &&
      typeof row.volume === "number" &&
      row.volume > 0,
  );
  return {
    status: "evaluated",
    universe_count: Math.max(tabCount, tabRows.length),
    volume_positive_count: volumePositive.length,
    gap_calculable_count: calculable.length,
    no_prior_session_count: 0,
    unresolved_gap_input_count: 0,
    qualified_count: tabRows.length,
    selected_count: tabRows.length,
  };
}

function nhlFromPublication(
  tabRows: readonly ScreenerResultRow[],
  tabCount: number,
  baselineStatus: unknown,
): NhlTabEvidence | null {
  const baseline = parseNhlBaselineStatus(baselineStatus);
  if (baseline !== "available" || tabRows.length === 0) return null;
  return {
    status: "evaluated",
    baseline_status: "available",
    baseline_quote_count: tabRows.length,
    universe_count: Math.max(tabCount, tabRows.length),
    eligible_count: tabRows.length,
    evaluated_count: tabRows.length,
    policy_excluded_count: 0,
    no_history_count: 0,
    unresolved_count: 0,
    qualified_count: tabRows.length,
    selected_count: tabRows.length,
  };
}

export function reconcilePublicationTabEvidence(input: {
  state: ScreenerFeedState;
  rows: readonly ScreenerResultRow[];
  evidence: TabEvaluationEvidenceMap | null;
}): TabEvaluationEvidenceMap | null {
  const tabCounts = parseTabCounts(input.state.tab_counts);
  if (!tabCounts) return input.evidence;

  const out: TabEvaluationEvidenceMap = { ...(input.evidence ?? {}) };

  for (const tabId of MANAGED_TAB_IDS) {
    if (out[tabId]) continue;
    const tabRows = input.rows.filter((row) => row.tab_id === tabId);
    const tabCount = tabCounts[tabId as ManagedTabId];
    if (tabRows.length === 0 && tabCount === 0) continue;

    if (tabId === "gappers") {
      const gappers = gappersFromPublication(tabRows, tabCount);
      if (gappers) out.gappers = gappers;
      continue;
    }
    if (tabId === NHL_TAB_ID) {
      const nhl = nhlFromPublication(tabRows, tabCount, input.state.nhl_baseline_status);
      if (nhl) out.new_highs_lows = nhl;
      continue;
    }
    if (tabRows.length > 0 || tabCount > 0) {
      out[tabId as ManagedTabId] = genericFromPublication(tabRows, tabCount);
    }
  }

  return Object.keys(out).length > 0 ? out : input.evidence;
}
