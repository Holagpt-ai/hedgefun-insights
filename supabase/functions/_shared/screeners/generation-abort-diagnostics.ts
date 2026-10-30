/**
 * Durable abort diagnostics for staged screener finalization (Batch 190.6).
 * Does not change shouldPreservePriorScreenerGeneration guard semantics.
 */

import type { TabEvaluationEvidenceMap } from "./evaluation-evidence.ts";

export type ScreenerSyncAbortReason =
  | "prior_generation_retained"
  | "newer_generation_live";

export type PreservationTabId = "gappers" | "gainers_losers" | "new_highs_lows";

type EvidenceStatus = "evaluated" | "prerequisite_unavailable" | "not_evaluated";

const PRESERVATION_TABS: PreservationTabId[] = [
  "gappers",
  "gainers_losers",
  "new_highs_lows",
];

function tabStatus(
  evidence: TabEvaluationEvidenceMap | null | undefined,
  tabId: PreservationTabId,
): EvidenceStatus | null {
  const row = evidence?.[tabId];
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
  tabId: PreservationTabId,
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

export type PriorGenerationRetentionEvidence = {
  prior_synced_at: string | null;
  candidate_generation_id: string;
  candidate_sync_run_id: string;
  tabs: Array<{
    tab: PreservationTabId;
    prior_status: EvidenceStatus | null;
    candidate_status: EvidenceStatus | null;
    triggered_preservation: boolean;
  }>;
};

export type ScreenerSyncAbortDetail = {
  reason: ScreenerSyncAbortReason;
  evidence: PriorGenerationRetentionEvidence | Record<string, unknown> | null;
};

export function buildPriorGenerationRetentionAbortDetail(input: {
  priorEvidence: TabEvaluationEvidenceMap | null | undefined;
  nextEvidence: TabEvaluationEvidenceMap;
  priorSyncedAt: string | null | undefined;
  candidateGenerationId: string;
  candidateSyncRunId: string;
}): ScreenerSyncAbortDetail {
  const tabs = PRESERVATION_TABS.map((tab) => ({
    tab,
    prior_status: tabStatus(input.priorEvidence, tab),
    candidate_status: tabStatus(input.nextEvidence, tab),
    triggered_preservation: wouldDegradeTab(
      input.priorEvidence,
      input.nextEvidence,
      tab,
    ),
  }));
  return {
    reason: "prior_generation_retained",
    evidence: {
      prior_synced_at: input.priorSyncedAt ?? null,
      candidate_generation_id: input.candidateGenerationId,
      candidate_sync_run_id: input.candidateSyncRunId,
      tabs,
    },
  };
}

export function buildNewerGenerationLiveAbortDetail(input: {
  candidateGenerationId: string;
  candidateSyncRunId: string;
}): ScreenerSyncAbortDetail {
  return {
    reason: "newer_generation_live",
    evidence: {
      candidate_generation_id: input.candidateGenerationId,
      candidate_sync_run_id: input.candidateSyncRunId,
    },
  };
}
