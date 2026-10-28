import { SCREENER_SYNC_LEASE_MS, type StagedChunkArtifacts, type StagedGenerationJob } from "./sync-staging-types.ts";

export type StoreOk<T> = { ok: true } & T;
export type StoreErr = { ok: false; reason: string };

export function leaseActive(
  job: StagedGenerationJob,
  nowMs: number,
): boolean {
  return job.leaseExpiresMs !== null && job.leaseExpiresMs > nowMs;
}

export function finalizeLeaseActive(
  job: StagedGenerationJob,
  nowMs: number,
): boolean {
  return job.finalizeLeaseExpiresMs !== null &&
    job.finalizeLeaseExpiresMs > nowMs;
}

export function claimLeaseInMemory(
  job: StagedGenerationJob,
  leaseToken: string,
  nowMs: number,
  mode: "chunk" | "finalize",
): StoreOk<{ job: StagedGenerationJob }> | StoreErr {
  if (job.status === "published" || job.status === "aborted" ||
    job.status === "failed") {
    return { ok: false, reason: "generation_not_active" };
  }

  if (mode === "finalize") {
    if (job.nextChunkIndex < job.totalChunks) {
      return { ok: false, reason: "chunks_incomplete" };
    }
    if (
      finalizeLeaseActive(job, nowMs) &&
      job.finalizeLeaseToken !== null &&
      job.finalizeLeaseToken !== leaseToken
    ) {
      return { ok: false, reason: "finalize_owner_conflict" };
    }
    job.status = "finalizing";
    job.finalizeLeaseToken = leaseToken;
    job.finalizeLeaseExpiresMs = nowMs + SCREENER_SYNC_LEASE_MS;
    job.leaseToken = leaseToken;
    job.leaseExpiresMs = nowMs + SCREENER_SYNC_LEASE_MS;
    return { ok: true, job };
  }

  if (job.nextChunkIndex >= job.totalChunks) {
    return { ok: false, reason: "chunks_complete" };
  }
  if (
    leaseActive(job, nowMs) && job.leaseToken !== null &&
    job.leaseToken !== leaseToken
  ) {
    return { ok: false, reason: "lease_owner_conflict" };
  }
  job.leaseToken = leaseToken;
  job.leaseExpiresMs = nowMs + SCREENER_SYNC_LEASE_MS;
  return { ok: true, job };
}

export function advanceChunkInMemory(
  job: StagedGenerationJob,
  input: {
    leaseToken: string;
    expectedChunkIndex: number;
    expectedStateVersion: number;
    merged: StagedChunkArtifacts;
    nowMs: number;
  },
): StoreOk<{ job: StagedGenerationJob }> | StoreErr {
  if (job.leaseToken !== input.leaseToken) {
    return { ok: false, reason: "lease_mismatch" };
  }
  if (!leaseActive(job, input.nowMs)) {
    return { ok: false, reason: "lease_expired" };
  }
  if (job.nextChunkIndex !== input.expectedChunkIndex) {
    return { ok: false, reason: "chunk_index_mismatch" };
  }
  if (job.stateVersion !== input.expectedStateVersion) {
    return { ok: false, reason: "state_version_mismatch" };
  }
  job.merged = input.merged;
  job.nextChunkIndex = input.expectedChunkIndex + 1;
  job.stateVersion = input.expectedStateVersion + 1;
  job.leaseToken = null;
  job.leaseExpiresMs = null;
  if (job.nextChunkIndex >= job.totalChunks) {
    job.status = "finalizing";
  } else {
    job.status = "chunking";
  }
  job.updatedAtMs = input.nowMs;
  return { ok: true, job };
}

export function completePublishInMemory(
  job: StagedGenerationJob,
  input: {
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    nowMs: number;
  },
): StoreOk<{ published: true }> | StoreErr {
  if (job.status !== "finalizing") {
    return { ok: false, reason: "not_finalizing" };
  }
  if (job.finalizeLeaseToken !== input.finalizeLeaseToken) {
    return { ok: false, reason: "finalize_lease_mismatch" };
  }
  if (!finalizeLeaseActive(job, input.nowMs)) {
    return { ok: false, reason: "finalize_lease_expired" };
  }
  if (job.stateVersion !== input.expectedStateVersion) {
    return { ok: false, reason: "state_version_mismatch" };
  }
  if (job.publishRowsInserted === null) {
    return { ok: false, reason: "publish_rpc_not_recorded" };
  }
  job.status = "published";
  job.stateVersion = input.expectedStateVersion + 1;
  job.leaseToken = null;
  job.leaseExpiresMs = null;
  job.finalizeLeaseToken = null;
  job.finalizeLeaseExpiresMs = null;
  job.continueLastError = null;
  job.updatedAtMs = input.nowMs;
  return { ok: true, published: true };
}

export function recordPublishRpcInMemory(
  job: StagedGenerationJob,
  input: {
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    syncRunId: string;
    rowsInserted: number;
    nowMs: number;
  },
): StoreOk<{ job: StagedGenerationJob }> | StoreErr {
  if (job.finalizeLeaseToken !== input.finalizeLeaseToken) {
    return { ok: false, reason: "finalize_lease_mismatch" };
  }
  if (job.observation.syncRunId !== input.syncRunId) {
    return { ok: false, reason: "sync_run_mismatch" };
  }
  if (job.stateVersion !== input.expectedStateVersion) {
    return { ok: false, reason: "state_version_mismatch" };
  }
  if (
    job.publishRowsInserted !== null &&
    job.publishRowsInserted !== input.rowsInserted
  ) {
    return { ok: false, reason: "publish_rows_conflict" };
  }
  job.publishRowsInserted = input.rowsInserted;
  job.publishRpcRecordedAtMs = input.nowMs;
  job.stateVersion = input.expectedStateVersion + 1;
  job.updatedAtMs = input.nowMs;
  return { ok: true, job };
}
