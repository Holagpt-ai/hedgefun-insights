/**
 * Attach publication-only evidence when feed_state.tab_evaluation_evidence is null
 * after RPC fallback / pre-column rollout. Never infers universe evaluation, zero-match
 * outcomes, or unresolved baseline/gap accounting — only published row counts.
 */

import {
  MANAGED_TAB_IDS,
  parseTabCounts,
  type ManagedTabId,
  type ScreenerFeedState,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";
import type {
  PublicationConfirmedTabEvidence,
  TabEvaluationEvidenceMap,
} from "@/lib/screeners/tab-evaluation-evidence";

function publicationFromRows(
  tabRows: readonly ScreenerResultRow[],
): PublicationConfirmedTabEvidence | null {
  if (tabRows.length === 0) return null;
  return {
    status: "publication_confirmed",
    published_count: tabRows.length,
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
    if (tabRows.length === 0) continue;

    const pub = publicationFromRows(tabRows);
    if (pub) out[tabId as ManagedTabId] = pub;
  }

  return Object.keys(out).length > 0 ? out : input.evidence;
}
