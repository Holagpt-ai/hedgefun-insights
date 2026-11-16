/**
 * Preserve the last verified screener generation when a transient sync would
 * replace evaluated evidence with prerequisite_unavailable at session boundaries.
 */

import type { TabEvaluationEvidenceMap } from "./evaluation-evidence.ts";
import { canAllowDegradedGappersPublication } from "./screener-degraded-gappers-publish.ts";
import { isPreviousSessionSnapshotDuringLiveSession } from "./screener-session.ts";

type EvidenceStatus = "evaluated" | "prerequisite_unavailable" | "not_evaluated";

function tabStatus(
  evidence: TabEvaluationEvidenceMap | null | undefined,
  tabId: string,
): EvidenceStatus | null {
  const row = evidence?.[tabId as keyof TabEvaluationEvidenceMap];
  if (!row || typeof row !== "object" || !("status" in row)) return null;
  const status = row.status;
  if (
    status === "evaluated" || status === "prerequisite_unavailable" ||
    status === "not_evaluated"
  ) {
    return status;
  }
  return null;
}

function wouldDegradeTab(
  prior: TabEvaluationEvidenceMap | null | undefined,
  next: TabEvaluationEvidenceMap,
  tabId: string,
): boolean {
  const priorStatus = tabStatus(prior, tabId);
  const nextStatus = tabStatus(next, tabId);
  if (priorStatus === "evaluated" && nextStatus === "prerequisite_unavailable") {
    return true;
  }
  if (tabId === "new_highs_lows") {
    if (priorStatus === "evaluated" && nextStatus === "not_evaluated") {
      return true;
    }
  }
  return false;
}

const PRESERVE_TABS = [
  "gappers",
  "gainers_losers",
  "new_highs_lows",
] as const;

export function shouldPreservePriorScreenerGeneration(input: {
  priorEvidence: TabEvaluationEvidenceMap | null | undefined;
  nextEvidence: TabEvaluationEvidenceMap;
  nowMs: number;
  priorSyncedAt: string | null | undefined;
  /** When true, gappers-only `gap_input_coverage_incomplete` does not retain. */
  allowDegradedGappersPublish?: boolean;
}): boolean {
  if (
    isPreviousSessionSnapshotDuringLiveSession({
      nowMs: input.nowMs,
      referenceIso: input.priorSyncedAt,
    })
  ) {
    return false;
  }
  const degraded: (typeof PRESERVE_TABS)[number][] = [];
  for (const tabId of PRESERVE_TABS) {
    if (wouldDegradeTab(input.priorEvidence, input.nextEvidence, tabId)) {
      degraded.push(tabId);
    }
  }
  if (degraded.length === 0) return false;
  if (
    canAllowDegradedGappersPublication({
      degradedTabs: degraded,
      nextEvidence: input.nextEvidence,
      allowDegradedGappersPublish: input.allowDegradedGappersPublish,
    })
  ) {
    return false;
  }
  return true;
}
