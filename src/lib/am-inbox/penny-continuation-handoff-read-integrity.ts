import {
  PENNY_CONTINUATION_HANDOFF_READ_PROJECTION_VERSION,
} from "@/lib/am-inbox/penny-continuation-handoff-config";
import type { PennyContinuationHandoffReadProjection } from "@/lib/am-inbox/penny-continuation-handoff-persistence";
import {
  PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION,
  type PennyContinuationWorkflowHandoff,
} from "@/lib/am-inbox/penny-continuation-workflow-types";
import { validatePennyBadgeForHandoff } from "@/lib/am-inbox/penny-continuation-badge-integrity";

export const PENNY_CONTINUATION_INTEGRATION_VERSION =
  "penny_continuation_integration_v1" as const;
export const PENNY_CONTINUATION_MODEL_VERSION = "penny_continuation_v1" as const;

export function isSupportedPennyHandoffReadProjection(
  row: PennyContinuationHandoffReadProjection,
): boolean {
  return (
    row.projection_version === PENNY_CONTINUATION_HANDOFF_READ_PROJECTION_VERSION &&
    row.handoff_version === PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION &&
    row.integration_version === PENNY_CONTINUATION_INTEGRATION_VERSION &&
    row.model_version === PENNY_CONTINUATION_MODEL_VERSION &&
    row.continuation_qualified === true
  );
}

export function pennyHandoffCandidateFromReadProjection(
  row: PennyContinuationHandoffReadProjection,
  badge: NonNullable<PennyContinuationWorkflowHandoff["badge"]>,
): PennyContinuationWorkflowHandoff {
  const snap = row.rank_snapshot ?? {};
  const rankKeys = snap.rank_keys ?? {
    sharesPerMinute: null,
    sessionVolume: null,
    dollarVolume: null,
  };
  return {
    handoff_version: PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION,
    integration_version: PENNY_CONTINUATION_INTEGRATION_VERSION,
    model_version: PENNY_CONTINUATION_MODEL_VERSION,
    symbol: row.symbol.trim().toUpperCase(),
    sourceSessionDate: row.source_session_date,
    symbolObservationIso: row.symbol_observation_at,
    captureIso: row.capture_at,
    continuationQualified: true,
    corePassCount: snap.core_pass_count ?? badge.corePassCount,
    score: snap.score ?? badge.score ?? null,
    rankKeys: {
      sharesPerMinute: rankKeys.sharesPerMinute ?? null,
      sessionVolume: rankKeys.sessionVolume ?? null,
      dollarVolume: rankKeys.dollarVolume ?? null,
    },
    dataFreshnessLabel: snap.data_freshness_label ?? badge.dataFreshnessLabel ?? null,
    supplementalLabels: snap.supplemental_labels ?? badge.supplementalLabels ?? [],
    publicationIdempotencyKey: row.publication_idempotency_key,
    publicationSuppressed: row.publication_suppressed,
    badge,
    qualificationEvidenceKind: row.qualification_evidence_kind,
    stableRankingKey: snap.stable_ranking_key ?? null,
  };
}

export function verifyPennyHandoffReadProjection(
  row: PennyContinuationHandoffReadProjection,
  badge: PennyContinuationWorkflowHandoff["badge"],
): boolean {
  if (!badge || !isSupportedPennyHandoffReadProjection(row)) return false;
  const candidate = pennyHandoffCandidateFromReadProjection(row, badge);
  return validatePennyBadgeForHandoff(badge, candidate);
}
