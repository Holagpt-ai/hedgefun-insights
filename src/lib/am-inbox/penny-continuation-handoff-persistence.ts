import type {
  PennyAmInboxBadgePayload,
  PennyContinuationWorkflowHandoff,
  PennyDataFreshnessLabel,
  PennyQualificationEvidenceKind,
  PennySupplementalLabel,
} from "@/lib/am-inbox/penny-continuation-workflow-types";
import {
  pennyHandoffCandidateFromReadProjection,
  verifyPennyHandoffReadProjection,
} from "@/lib/am-inbox/penny-continuation-handoff-read-integrity";
import { PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION } from "@/lib/am-inbox/penny-continuation-workflow-types";

export type PersistedPennyContinuationHandoffRow = {
  id: string;
  security_id: string | null;
  symbol: string;
  source_session_date: string;
  capture_at: string;
  symbol_observation_at: string | null;
  handoff_version: string;
  integration_version: string;
  model_version: string;
  publication_idempotency_key: string;
  observation_generation_id: string;
  generation_sync_ms: number;
  generation_sync_at: string;
  continuation_qualified: boolean;
  publication_suppressed: boolean;
  qualification_evidence_kind: PennyQualificationEvidenceKind;
  valid_from_session_date: string;
  valid_through_session_date: string;
  badge_payload: PennyAmInboxBadgePayload;
  rank_snapshot: {
    score?: number | null;
    core_pass_count?: number;
    data_freshness_label?: PennyDataFreshnessLabel;
    rank_keys?: {
      sharesPerMinute: number | null;
      sessionVolume: number | null;
      dollarVolume: number | null;
    };
    supplemental_labels?: PennySupplementalLabel[];
    stable_ranking_key?: string | null;
  };
  revoked_at: string | null;
};

function readBadgePayload(value: unknown): PennyAmInboxBadgePayload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.kind !== "penny_continuation_v1") return null;
  if (typeof row.symbol !== "string" || typeof row.sessionDate !== "string") return null;
  return row as unknown as PennyAmInboxBadgePayload;
}

export function mapPersistedPennyHandoffRow(
  row: PersistedPennyContinuationHandoffRow,
): PennyContinuationWorkflowHandoff | null {
  if (row.revoked_at) return null;
  const badge = readBadgePayload(row.badge_payload);
  if (!badge || !row.continuation_qualified) return null;
  const snap = row.rank_snapshot ?? {};
  const rankKeys = snap.rank_keys ?? {
    sharesPerMinute: null,
    sessionVolume: null,
    dollarVolume: null,
  };
  return {
    handoff_version: PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION,
    integration_version: row.integration_version,
    model_version: row.model_version,
    symbol: row.symbol.trim().toUpperCase(),
    sourceSessionDate: row.source_session_date,
    symbolObservationIso: row.symbol_observation_at,
    captureIso: row.capture_at,
    continuationQualified: row.continuation_qualified,
    corePassCount: snap.core_pass_count ?? badge.corePassCount,
    score: snap.score ?? badge.score ?? null,
    rankKeys,
    dataFreshnessLabel: snap.data_freshness_label ?? badge.dataFreshnessLabel ?? null,
    supplementalLabels: snap.supplemental_labels ?? badge.supplementalLabels ?? [],
    publicationIdempotencyKey: row.publication_idempotency_key,
    publicationSuppressed: row.publication_suppressed,
    badge,
    qualificationEvidenceKind: row.qualification_evidence_kind,
    stableRankingKey: snap.stable_ranking_key ?? null,
  };
}

export function mapPersistedPennyHandoffRows(
  rows: readonly PersistedPennyContinuationHandoffRow[],
): PennyContinuationWorkflowHandoff[] {
  const out: PennyContinuationWorkflowHandoff[] = [];
  for (const row of rows) {
    const mapped = mapPersistedPennyHandoffRow(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Narrow RPC read projection (not a full table row). */
export type PennyContinuationHandoffReadProjection = {
  projection_version: string;
  handoff_version: string;
  integration_version: string;
  model_version: string;
  symbol: string;
  source_session_date: string;
  capture_at: string;
  symbol_observation_at: string | null;
  publication_idempotency_key: string;
  publication_suppressed: boolean;
  qualification_evidence_kind: PennyQualificationEvidenceKind;
  continuation_qualified: boolean;
  badge_payload: PennyAmInboxBadgePayload;
  rank_snapshot: PersistedPennyContinuationHandoffRow["rank_snapshot"];
};

export function mapPennyHandoffReadProjection(
  row: PennyContinuationHandoffReadProjection,
): PennyContinuationWorkflowHandoff | null {
  const badge = readBadgePayload(row.badge_payload);
  if (!badge || !verifyPennyHandoffReadProjection(row, badge)) return null;
  return pennyHandoffCandidateFromReadProjection(row, badge);
}

export function mapPennyHandoffReadProjections(
  rows: readonly PennyContinuationHandoffReadProjection[],
): PennyContinuationWorkflowHandoff[] {
  const out: PennyContinuationWorkflowHandoff[] = [];
  for (const row of rows) {
    const mapped = mapPennyHandoffReadProjection(row);
    if (mapped) out.push(mapped);
  }
  return out;
}
