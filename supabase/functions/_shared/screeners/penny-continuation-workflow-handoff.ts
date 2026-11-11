/**
 * Projects Batch 224 integration output into versioned AM Inbox workflow handoffs.
 * Preserves evaluator evidence — no re-qualification.
 */

import { PENNY_CONTINUATION_MODEL_VERSION } from "../config/penny-continuation.config.ts";
import type { PennyContinuationIntegrationResult } from "./penny-continuation-integration-types.ts";
import {
  pennyHandoffProjectionAllowed,
  validatePennyAmInboxBadgePayload,
} from "./penny-continuation-badge-integrity.ts";
import { buildPennyAmInboxBadgePayload } from "./penny-continuation-handoff.ts";
import type { PennyContinuationResult } from "./penny-continuation-types.ts";
import { normalizeSymbol } from "./selection.ts";
import {
  PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION,
  type PennyContinuationWorkflowHandoff,
  type PennyContinuationWorkflowHandoffBundle,
  type PennyQualificationEvidenceKind,
} from "./penny-continuation-workflow-handoff-types.ts";

function observationIsoFromResult(result: PennyContinuationResult): string | null {
  const ms = result.evidence.symbolObservationMs;
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function resolvePennyQualificationEvidenceKind(input: {
  sourceSessionDate: string;
  integrationSessionDate: string;
  amSessionDate?: string | null;
}): PennyQualificationEvidenceKind {
  if (
    input.amSessionDate &&
    input.amSessionDate !== input.sourceSessionDate
  ) {
    return "prior_session_capture";
  }
  if (input.integrationSessionDate !== input.sourceSessionDate) {
    return "prior_session_capture";
  }
  return "live_market";
}

export function projectPennyWorkflowHandoffFromResult(
  result: PennyContinuationResult,
  input: {
    integration_version: PennyContinuationWorkflowHandoffBundle["integration_version"];
    captureIso: string;
    integrationSessionDate: string;
    amSessionDate?: string | null;
  },
): PennyContinuationWorkflowHandoff | null {
  if (!result.continuationQualified) return null;
  if (!pennyHandoffProjectionAllowed(result, input.integrationSessionDate)) {
    return null;
  }
  const symbol = normalizeSymbol(result.symbol);
  const sessionDate = result.sessionDate;
  if (!symbol || !sessionDate) return null;

  const badge = buildPennyAmInboxBadgePayload(result);
  if (!badge) return null;
  if (!validatePennyAmInboxBadgePayload(badge, { symbol, sourceSessionDate: sessionDate })) {
    return null;
  }

  return {
    handoff_version: PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION,
    integration_version: input.integration_version,
    model_version: PENNY_CONTINUATION_MODEL_VERSION,
    symbol,
    sourceSessionDate: sessionDate,
    symbolObservationIso: observationIsoFromResult(result),
    captureIso: input.captureIso,
    continuationQualified: true,
    corePassCount: result.corePassCount,
    score: result.score,
    rankKeys: {
      sharesPerMinute: result.rankKeys.sharesPerMinute,
      sessionVolume: result.rankKeys.sessionVolume,
      dollarVolume: result.rankKeys.dollarVolume,
    },
    dataFreshnessLabel: result.dataFreshnessLabel,
    supplementalLabels: [...result.supplementalLabels],
    evidenceProvenance: { ...result.evidence },
    publicationIdempotencyKey: result.publicationIdempotencyKey,
    publicationSuppressed: result.publicationSuppressed,
    badge,
    qualificationEvidenceKind: resolvePennyQualificationEvidenceKind({
      sourceSessionDate: sessionDate,
      integrationSessionDate: input.integrationSessionDate,
      amSessionDate: input.amSessionDate,
    }),
    stableRankingKey: result.stableRankingKey,
  };
}

export function projectPennyWorkflowHandoffsFromIntegration(
  integration: PennyContinuationIntegrationResult,
  options?: { amSessionDate?: string | null },
): PennyContinuationWorkflowHandoffBundle {
  const handoffs: PennyContinuationWorkflowHandoff[] = [];
  for (const result of integration.rankedQualified) {
    const projected = projectPennyWorkflowHandoffFromResult(result, {
      integration_version: integration.integration_version,
      captureIso: integration.evaluatedAt,
      integrationSessionDate: integration.sessionDate,
      amSessionDate: options?.amSessionDate,
    });
    if (projected) handoffs.push(projected);
  }

  return {
    handoff_version: PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION,
    integration_version: integration.integration_version,
    model_version: integration.model_version,
    sourceSessionDate: integration.sessionDate,
    captureIso: integration.evaluatedAt,
    handoffs,
  };
}
