/**
 * Durable abort diagnostics for staged screener finalization (Batch 190.6).
 * Does not change shouldPreservePriorScreenerGeneration guard semantics.
 */

import type { GappersTabEvidence, TabEvaluationEvidenceMap } from "./evaluation-evidence.ts";
import { boundedSymbolSample } from "./evaluation-evidence.ts";
import type { GappersEvidenceAccum } from "./evaluation-evidence-chunk.ts";

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

export type CandidateGappersAbortSnapshot = {
  status: GappersTabEvidence["status"];
  reason?: string;
  volume_positive_count: number;
  gap_calculable_count: number;
  no_prior_session_count: number;
  split_scale_suppressed_count: number;
  unresolved_gap_input_count: number;
  unresolved_gap_symbols?: string[];
};

export type PriorGenerationRetentionEvidence = {
  prior_synced_at: string | null;
  candidate_generation_id: string;
  candidate_sync_run_id: string;
  candidate_gappers?: CandidateGappersAbortSnapshot;
  tabs: Array<{
    tab: PreservationTabId;
    prior_status: EvidenceStatus | null;
    candidate_status: EvidenceStatus | null;
    triggered_preservation: boolean;
  }>;
};

function summarizeCandidateGappers(
  nextEvidence: TabEvaluationEvidenceMap,
  accum?: GappersEvidenceAccum,
): CandidateGappersAbortSnapshot | undefined {
  const row = nextEvidence?.gappers;
  if (!row || typeof row !== "object") return undefined;
  const g = row as GappersTabEvidence;
  const fromEvidence = Array.isArray(g.unresolved_gap_symbols)
    ? g.unresolved_gap_symbols
    : [];
  const fromAccum = accum?.unresolvedGapSymbols ?? [];
  const mergedSymbols = boundedSymbolSample([
    ...new Set([...fromEvidence, ...fromAccum]),
  ]);
  return {
    status: g.status,
    reason: g.reason,
    volume_positive_count: g.volume_positive_count,
    gap_calculable_count: g.gap_calculable_count,
    no_prior_session_count: g.no_prior_session_count,
    split_scale_suppressed_count: g.split_scale_suppressed_count,
    unresolved_gap_input_count: g.unresolved_gap_input_count,
    unresolved_gap_symbols: mergedSymbols,
  };
}

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
  candidateGappersAccum?: GappersEvidenceAccum;
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
      candidate_gappers: summarizeCandidateGappers(
        input.nextEvidence,
        input.candidateGappersAccum,
      ),
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
