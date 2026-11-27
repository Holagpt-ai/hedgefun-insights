import { parseTimestampMs } from "@/lib/screeners/contract";
import {
  assessScreenerGenerationSession,
  isLiveSurveillanceSessionKind,
  resolveConsumerSessionKind,
} from "@/lib/screeners/screener-session";
import {
  getTabEvaluationEvidence,
  tabEvidenceSupportsEvaluatedEmpty,
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

/**
 * Observation reference for tab session alignment.
 * Publication `synced_at` is never treated as market observation time.
 */
export function resolveActiveTabSessionReference(input: {
  nowMs: number;
  activeTabId: string;
  rows: readonly { tab_id: string; provider_as_of: string }[];
  providerAsOfMax: string | null;
  tabEvaluationEvidence?: TabEvaluationEvidenceMap | null;
}): string | null {
  const tabRows = input.rows.filter((row) => row.tab_id === input.activeTabId);
  const tabNewest = newestProviderAsOfForTabRows(input.rows, input.activeTabId);
  const tabEvidence = getTabEvaluationEvidence(
    input.tabEvaluationEvidence ?? null,
    input.activeTabId,
  );

  if (tabRows.length > 0) {
    return tabNewest ?? input.providerAsOfMax;
  }

  if (
    tabEvidenceSupportsEvaluatedEmpty(input.activeTabId, tabEvidence)
    && input.providerAsOfMax
    && assessScreenerGenerationSession({
      nowMs: input.nowMs,
      referenceIso: input.providerAsOfMax,
    }) === "current"
  ) {
    return input.providerAsOfMax;
  }

  return tabNewest;
}

/**
 * During live surveillance, drop prior-session rows on the active tab.
 * Outside live surveillance, preserve closed-market / snapshot rows unchanged.
 */
export function filterActiveTabRowsForCurrentSession<T extends { tab_id: string; provider_as_of: string }>(
  rows: readonly T[],
  activeTabId: string,
  nowMs: number,
): T[] {
  const onTab = rows.filter((row) => row.tab_id === activeTabId);
  const sessionKind = resolveConsumerSessionKind(nowMs);
  if (!isLiveSurveillanceSessionKind(sessionKind)) {
    return onTab;
  }
  return onTab.filter(
    (row) =>
      assessScreenerGenerationSession({
        nowMs,
        referenceIso: row.provider_as_of,
      }) === "current",
  );
}