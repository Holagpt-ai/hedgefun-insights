import type { FrozenNhlBaselineSnapshot } from "./nhl-baseline-snapshot.ts";
import type { NhlCandidateRow } from "./new-highs-lows.ts";
import {
  emptyChunkArtifacts,
  type StagedChunkArtifacts,
  type StagedGenerationJob,
  type StagedGenerationStatus,
  type StagedObservationContext,
} from "./sync-staging-types.ts";
import type { PolygonTicker } from "./selection.ts";

type SerializedMerged = Omit<StagedChunkArtifacts, "nhlCandidates"> & {
  nhlCandidates: Array<[string, NhlCandidateRow]>;
};

export function serializeMergedArtifacts(
  merged: StagedChunkArtifacts,
): SerializedMerged {
  return {
    ...merged,
    nhlCandidates: [...merged.nhlCandidates.entries()],
  };
}

export function deserializeMergedArtifacts(raw: unknown): StagedChunkArtifacts {
  if (!raw || typeof raw !== "object") return emptyChunkArtifacts();
  const o = raw as Record<string, unknown>;
  const base = emptyChunkArtifacts();
  if (o.radar && typeof o.radar === "object") {
    base.radar = { ...base.radar, ...(o.radar as typeof base.radar) };
  }
  if (o.mainQualified && typeof o.mainQualified === "object") {
    base.mainQualified = {
      ...base.mainQualified,
      ...(o.mainQualified as typeof base.mainQualified),
    };
  }
  if (o.gappersAccum && typeof o.gappersAccum === "object") {
    base.gappersAccum = {
      ...base.gappersAccum,
      ...(o.gappersAccum as typeof base.gappersAccum),
    };
  }
  if (o.primaryAccum && typeof o.primaryAccum === "object") {
    base.primaryAccum = {
      ...base.primaryAccum,
      ...(o.primaryAccum as typeof base.primaryAccum),
    };
  }
  if (o.nhlEvidenceAccum && typeof o.nhlEvidenceAccum === "object") {
    const acc = o.nhlEvidenceAccum as typeof base.nhlEvidenceAccum;
    base.nhlEvidenceAccum = {
      ...base.nhlEvidenceAccum,
      ...acc,
      unresolvedSymbols: Array.isArray(acc.unresolvedSymbols)
        ? acc.unresolvedSymbols
        : [],
      noHistorySymbols: Array.isArray(acc.noHistorySymbols)
        ? acc.noHistorySymbols
        : [],
    };
  }
  const entries = o.nhlCandidates;
  if (Array.isArray(entries)) {
    for (const item of entries) {
      if (!Array.isArray(item) || item.length !== 2) continue;
      const sym = item[0];
      const row = item[1];
      if (typeof sym === "string" && row && typeof row === "object") {
        base.nhlCandidates.set(sym, row as NhlCandidateRow);
      }
    }
  }
  return base;
}

export type StagingJobRow = {
  id: string;
  sync_run_id: string;
  status: StagedGenerationStatus;
  observation: StagedObservationContext;
  all_tickers: PolygonTicker[];
  gainers: PolygonTicker[];
  losers: PolygonTicker[];
  chunk_size: number;
  next_chunk_index: number;
  total_chunks: number;
  merged_artifacts: unknown;
  lease_token: string | null;
  lease_expires_at: string | null;
  nhl_baseline_loaded: boolean;
  nhl_baseline_snapshot: FrozenNhlBaselineSnapshot | null;
  state_version: number;
  continue_last_at: string | null;
  continue_last_error: string | null;
  finalize_lease_token: string | null;
  finalize_lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export function jobFromRow(row: StagingJobRow): StagedGenerationJob {
  return {
    id: row.id,
    status: row.status,
    observation: row.observation,
    allTickers: row.all_tickers,
    gainers: row.gainers,
    losers: row.losers,
    chunkSize: row.chunk_size,
    nextChunkIndex: row.next_chunk_index,
    totalChunks: row.total_chunks,
    merged: deserializeMergedArtifacts(row.merged_artifacts),
    leaseToken: row.lease_token,
    leaseExpiresMs: row.lease_expires_at
      ? Date.parse(row.lease_expires_at)
      : null,
    createdAtMs: Date.parse(row.created_at),
    updatedAtMs: Date.parse(row.updated_at),
    nhlBaselineLoaded: row.nhl_baseline_loaded,
    nhlBaselineSnapshot: row.nhl_baseline_snapshot,
    stateVersion: row.state_version ?? 0,
    continueLastAtMs: row.continue_last_at
      ? Date.parse(row.continue_last_at)
      : null,
    continueLastError: row.continue_last_error,
    finalizeLeaseToken: row.finalize_lease_token,
    finalizeLeaseExpiresMs: row.finalize_lease_expires_at
      ? Date.parse(row.finalize_lease_expires_at)
      : null,
  };
}

export function jobToInsertRow(
  job: StagedGenerationJob,
): Record<string, unknown> {
  return {
    id: job.id,
    sync_run_id: job.observation.syncRunId,
    status: job.status,
    observation: job.observation,
    all_tickers: job.allTickers,
    gainers: job.gainers,
    losers: job.losers,
    chunk_size: job.chunkSize,
    next_chunk_index: job.nextChunkIndex,
    total_chunks: job.totalChunks,
    merged_artifacts: serializeMergedArtifacts(job.merged),
    lease_token: job.leaseToken,
    lease_expires_at: job.leaseExpiresMs
      ? new Date(job.leaseExpiresMs).toISOString()
      : null,
    nhl_baseline_loaded: job.nhlBaselineLoaded,
    nhl_baseline_snapshot: job.nhlBaselineSnapshot,
    state_version: job.stateVersion,
    continue_last_at: job.continueLastAtMs
      ? new Date(job.continueLastAtMs).toISOString()
      : null,
    continue_last_error: job.continueLastError,
    finalize_lease_token: job.finalizeLeaseToken,
    finalize_lease_expires_at: job.finalizeLeaseExpiresMs
      ? new Date(job.finalizeLeaseExpiresMs).toISOString()
      : null,
  };
}
