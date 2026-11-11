/**
 * Batch 225 — versioned Penny Continuation → AM Inbox workflow handoff contract.
 * Pure data shapes; no persistence or live wiring.
 */

import type {
  PennyContinuationModelVersion,
} from "../config/penny-continuation.config.ts";
import type {
  PennyAmInboxBadgePayload,
  PennyContinuationResult,
  PennyDataFreshnessLabel,
  PennyEvidenceProvenance,
  PennySupplementalLabel,
} from "./penny-continuation-types.ts";
import type { PennyContinuationIntegrationVersion } from "./penny-continuation-integration-types.ts";

export const PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION =
  "penny_continuation_workflow_handoff_v1" as const;
export type PennyContinuationWorkflowHandoffVersion =
  typeof PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION;

export type PennyQualificationEvidenceKind =
  | "live_market"
  | "prior_session_capture";

export interface PennyContinuationWorkflowHandoff {
  handoff_version: PennyContinuationWorkflowHandoffVersion;
  integration_version: PennyContinuationIntegrationVersion;
  model_version: PennyContinuationModelVersion;
  symbol: string;
  sourceSessionDate: string;
  symbolObservationIso: string | null;
  captureIso: string;
  continuationQualified: boolean;
  corePassCount: number;
  score: number | null;
  rankKeys: PennyContinuationResult["rankKeys"];
  dataFreshnessLabel: PennyDataFreshnessLabel;
  supplementalLabels: readonly PennySupplementalLabel[];
  evidenceProvenance: PennyEvidenceProvenance;
  publicationIdempotencyKey: string | null;
  publicationSuppressed: boolean;
  badge: PennyAmInboxBadgePayload | null;
  qualificationEvidenceKind: PennyQualificationEvidenceKind;
  stableRankingKey: string | null;
}

export interface PennyContinuationWorkflowHandoffBundle {
  handoff_version: PennyContinuationWorkflowHandoffVersion;
  integration_version: PennyContinuationIntegrationVersion;
  model_version: PennyContinuationModelVersion;
  sourceSessionDate: string;
  captureIso: string;
  handoffs: PennyContinuationWorkflowHandoff[];
}
