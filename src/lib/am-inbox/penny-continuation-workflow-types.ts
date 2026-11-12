/**
 * Client mirror of Batch 225 Penny Continuation workflow handoff (badge matching only).
 */

import type { ContinuationCategory } from "@/config/continuation.config";
import type { LateSessionHandoffExpiryState } from "@/lib/am-inbox/late-session-continuation-types";
import type { SecurityId } from "@/types/security-identity";

export const PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION =
  "penny_continuation_workflow_handoff_v1" as const;

export type PennyAmInboxBadgeKind = "penny_continuation_v1";

export type PennyDataFreshnessLabel = "live" | "delayed" | "stale" | null;

export type PennySupplementalLabel = "late_day" | "next_session_carry";

export interface PennyAmInboxBadgePayload {
  kind: PennyAmInboxBadgeKind;
  symbol: string;
  sessionDate: string;
  continuationQualified: boolean;
  corePassCount: number;
  dataFreshnessLabel: PennyDataFreshnessLabel;
  score: number | null;
  supplementalLabels: PennySupplementalLabel[];
  model_version: string;
}

export type PennyQualificationEvidenceKind =
  | "live_market"
  | "prior_session_capture";

export interface PennyContinuationWorkflowHandoff {
  handoff_version: typeof PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION;
  integration_version: string;
  model_version: string;
  symbol: string;
  sourceSessionDate: string;
  symbolObservationIso: string | null;
  captureIso: string;
  continuationQualified: boolean;
  corePassCount: number;
  score: number | null;
  rankKeys: {
    sharesPerMinute: number | null;
    sessionVolume: number | null;
    dollarVolume: number | null;
  };
  dataFreshnessLabel: PennyDataFreshnessLabel;
  supplementalLabels: readonly PennySupplementalLabel[];
  publicationIdempotencyKey: string | null;
  publicationSuppressed: boolean;
  badge: PennyAmInboxBadgePayload | null;
  qualificationEvidenceKind: PennyQualificationEvidenceKind;
  stableRankingKey: string | null;
}

/** Existing AM Inbox row — identity and categories are preserved. */
export interface AmInboxPennyBadgeMatchTarget {
  candidateKey: string;
  symbol: string;
  sourceSessionDate: string;
  expiryState: LateSessionHandoffExpiryState;
  sourceCategories: readonly ContinuationCategory[];
  securityId: SecurityId | null;
}

export interface PennyContinuationBadgeAttachment {
  handoffKey: string;
  matchedCandidateKey: string;
  badge: PennyAmInboxBadgePayload;
  publicationSuppressed: boolean;
  qualificationEvidenceKind: PennyQualificationEvidenceKind;
}

export interface PennyContinuationBadgeMatchResult {
  attachments: PennyContinuationBadgeAttachment[];
  unmatchedHandoffKeys: string[];
  /** Targets returned unchanged (no new cards, categories, or ranks). */
  candidates: readonly AmInboxPennyBadgeMatchTarget[];
}
