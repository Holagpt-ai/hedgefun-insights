import { parseTimestampMs } from "@/lib/screeners/contract";
import { assessScreenerGenerationSession } from "@/lib/screeners/screener-session";
import {
  getTabEvaluationEvidence,
  type TabEvaluationEvidenceMap,
} from "@/lib/screeners/tab-evaluation-evidence";

/** Newest provider observation for rows on the active tab (not generation-wide max). */
export function newestProviderAsOfForTabRows(
  rows: readonly { tab_id: string; provider_as_of: string }[],
  activeTabId: string,
): string | null {
  let bestMs = -1;
  let bestIso: string | null = null;
  for (const row of rows) {
    if (row.tab_id !== activeTabId) continue;
    const ms = parseTimestampMs(row.provider_as_of);
    if (ms === null || ms <= bestMs) continue;
    bestMs = ms;
    bestIso = row.provider_as_of;
  }
  return bestIso;
}

function tabEvaluatedThisGeneration(
  evidence: TabEvaluationEvidenceMap | null | undefined,
  activeTabId: string,
): boolean {
  const entry = getTabEvaluationEvidence(evidence ?? null, activeTabId);
  if (!entry) return false;
  return entry.status === "evaluated" || entry.status === "publication_confirmed";
}

/**
 * Session reference for withholding/screener truth — tab-local provider times first,
 * with a synced_at fallback when this tab was evaluated in the current surveillance session
 * but row-level provider_as_of lags (common on NHL baseline belts).
 */
export function resolveActiveTabSessionReference(input: {
  nowMs: number;
  activeTabId: string;
  rows: readonly { tab_id: string; provider_as_of: string }[];
  syncedAt: string;
  providerAsOfMax: string | null;
  tabEvaluationEvidence?: TabEvaluationEvidenceMap | null;
}): string | null {
  const tabNewest = newestProviderAsOfForTabRows(input.rows, input.activeTabId);
  const generationRef = input.providerAsOfMax ?? input.syncedAt;
  let reference = tabNewest ?? generationRef;

  if (
    tabEvaluatedThisGeneration(input.tabEvaluationEvidence, input.activeTabId)
    && assessScreenerGenerationSession({
      nowMs: input.nowMs,
      referenceIso: input.syncedAt,
    }) === "current"
  ) {
    const tabAlign = assessScreenerGenerationSession({
      nowMs: input.nowMs,
      referenceIso: reference,
    });
    if (tabAlign === "previous_during_live") {
      reference = input.syncedAt;
    }
  }
  return reference;
}