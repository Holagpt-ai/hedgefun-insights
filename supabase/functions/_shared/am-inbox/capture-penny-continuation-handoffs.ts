import type { PennyContinuationWorkflowHandoff } from "../screeners/penny-continuation-workflow-handoff-types.ts";
import type { PennyContinuationWorkflowHandoffBundle } from "../screeners/penny-continuation-workflow-handoff-types.ts";
import { validatePennyAmInboxBadgePayload } from "../screeners/penny-continuation-badge-integrity.ts";
import { computePennyHandoffValidWindow } from "./penny-continuation-workflow-expiry.ts";
import type { PennyContinuationHandoffUpsertRow } from "./penny-continuation-workflow-persistence-types.ts";

export type PennyHandoffPersistenceMeta = {
  observationGenerationId: string;
  generationSyncMs: number;
  generationSyncIso: string;
  securityId?: string | null;
};

function parseObservationGenerationFromIdempotencyKey(
  key: string | null,
): string | null {
  if (!key) return null;
  const parts = key.split(":");
  if (parts.length < 4) return null;
  const gen = parts[3]?.trim();
  return gen && gen.length > 0 ? gen : null;
}

export function buildPennyContinuationHandoffUpsertRow(
  handoff: PennyContinuationWorkflowHandoff,
  meta: PennyHandoffPersistenceMeta,
): PennyContinuationHandoffUpsertRow | null {
  if (!handoff.continuationQualified || !handoff.badge) return null;
  if (
    !validatePennyAmInboxBadgePayload(handoff.badge, {
      symbol: handoff.symbol,
      sourceSessionDate: handoff.sourceSessionDate,
    })
  ) {
    return null;
  }
  const idem = handoff.publicationIdempotencyKey?.trim();
  if (!idem) return null;
  if (
    !Number.isFinite(meta.generationSyncMs) ||
    !meta.generationSyncIso ||
    !Number.isFinite(Date.parse(meta.generationSyncIso))
  ) {
    return null;
  }
  const obsGen = meta.observationGenerationId.trim() ||
    parseObservationGenerationFromIdempotencyKey(idem) ||
    "na";
  const window = computePennyHandoffValidWindow({
    sourceSessionDate: handoff.sourceSessionDate,
    qualificationEvidenceKind: handoff.qualificationEvidenceKind,
    supplementalLabels: handoff.supplementalLabels,
  });
  return {
    security_id: meta.securityId ?? null,
    symbol: handoff.symbol.trim().toUpperCase(),
    source_session_date: handoff.sourceSessionDate,
    capture_at: handoff.captureIso,
    symbol_observation_at: handoff.symbolObservationIso,
    handoff_version: handoff.handoff_version,
    integration_version: handoff.integration_version,
    model_version: handoff.model_version,
    publication_idempotency_key: idem,
    observation_generation_id: obsGen,
    generation_sync_ms: Math.floor(meta.generationSyncMs),
    generation_sync_at: meta.generationSyncIso,
    continuation_qualified: handoff.continuationQualified,
    publication_suppressed: handoff.publicationSuppressed,
    qualification_evidence_kind: handoff.qualificationEvidenceKind,
    valid_from_session_date: window.validFromSessionDate,
    valid_through_session_date: window.validThroughSessionDate,
    badge_payload: { ...handoff.badge },
    rank_snapshot: {
      score: handoff.score,
      core_pass_count: handoff.corePassCount,
      data_freshness_label: handoff.dataFreshnessLabel,
      rank_keys: { ...handoff.rankKeys },
      supplemental_labels: [...handoff.supplementalLabels],
      stable_ranking_key: handoff.stableRankingKey,
    },
  };
}

export function buildPennyContinuationHandoffUpsertRowsFromBundle(
  bundle: PennyContinuationWorkflowHandoffBundle,
  meta: PennyHandoffPersistenceMeta,
): PennyContinuationHandoffUpsertRow[] {
  const rows: PennyContinuationHandoffUpsertRow[] = [];
  for (const handoff of bundle.handoffs) {
    const row = buildPennyContinuationHandoffUpsertRow(handoff, meta);
    if (row) rows.push(row);
  }
  return rows;
}
