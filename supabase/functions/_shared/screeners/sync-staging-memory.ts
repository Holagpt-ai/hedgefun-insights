import {
  advanceChunkInMemory,
  claimLeaseInMemory,
  completePublishInMemory,
  expireStaleJobsInMemory,
  finalizeLeaseActive,
  leaseActive,
  publishStagedGenerationInMemory,
  recordPublishRpcInMemory,
} from "./sync-staging-cas.ts";
import {
  emptyChunkArtifacts,
  SCREENER_SYNC_JOB_TTL_MS,
  SCREENER_SYNC_LEASE_MS,
  type StagedChunkArtifacts,
  type StagedGenerationJob,
  type StagedGenerationStatus,
} from "./sync-staging-types.ts";

export interface SyncStagingStore {
  acquireOrCreate(
    input: Omit<
      StagedGenerationJob,
      | "id"
      | "leaseToken"
      | "leaseExpiresMs"
      | "createdAtMs"
      | "updatedAtMs"
      | "stateVersion"
      | "continueLastAtMs"
      | "continueLastError"
      | "finalizeLeaseToken"
      | "finalizeLeaseExpiresMs"
      | "publishRowsInserted"
      | "publishRpcRecordedAtMs"
    >,
    leaseToken: string,
    nowMs: number,
  ): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  >;
  get(id: string): Promise<StagedGenerationJob | null>;
  findResumableJob(nowMs: number): Promise<StagedGenerationJob | null>;
  claimWork(params: {
    jobId: string;
    leaseToken: string;
    nowMs: number;
    mode: "chunk" | "finalize";
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  >;
  advanceChunk(params: {
    jobId: string;
    leaseToken: string;
    expectedChunkIndex: number;
    expectedStateVersion: number;
    merged: StagedChunkArtifacts;
    nowMs: number;
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  >;
  completePublish(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    nowMs: number;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
  recordPublishRpc(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    syncRunId: string;
    rowsInserted: number;
    nowMs: number;
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  >;
  publishStagedGeneration(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    syncRunId: string;
    syncedAt: string;
    nhlBaselineStatus: string;
    tabEvaluationEvidence: unknown;
    rows: unknown[];
    nowMs: number;
  }): Promise<
    | { ok: true; rowsInserted: number; job: StagedGenerationJob }
    | { ok: false; reason: string }
  >;
  failJob(jobId: string, reason: string, nowMs: number): Promise<void>;
  abortJob(jobId: string, nowMs: number): Promise<void>;
  recordContinueDispatch(params: {
    jobId: string;
    action: string;
    ok: boolean;
    error?: string;
    nowMs: number;
  }): Promise<void>;
  abortExpired(nowMs: number): Promise<number>;
}

function cloneJob(job: StagedGenerationJob): StagedGenerationJob {
  return structuredClone(job);
}

export class MemorySyncStagingStore implements SyncStagingStore {
  private jobs = new Map<string, StagedGenerationJob>();

  /** Test helper: insert a fully-formed job without acquire semantics. */
  seedJob(job: StagedGenerationJob): void {
    this.jobs.set(job.id, cloneJob(job));
  }

  private hasActiveGeneration(): boolean {
    for (const job of this.jobs.values()) {
      if (job.status === "chunking" || job.status === "finalizing") {
        return true;
      }
    }
    return false;
  }

  private activeBlockingJob(nowMs: number): StagedGenerationJob | null {
    for (const job of this.jobs.values()) {
      if (job.status !== "chunking" && job.status !== "finalizing") continue;
      if (leaseActive(job, nowMs)) return job;
      if (job.status === "finalizing" && finalizeLeaseActive(job, nowMs)) {
        return job;
      }
    }
    return null;
  }

  async abortExpired(nowMs: number): Promise<number> {
    return expireStaleJobsInMemory(this.jobs, nowMs);
  }

  async findResumableJob(nowMs: number): Promise<StagedGenerationJob | null> {
    let best: StagedGenerationJob | null = null;
    for (const job of this.jobs.values()) {
      if (job.status !== "chunking" && job.status !== "finalizing") continue;
      if (nowMs - job.createdAtMs > SCREENER_SYNC_JOB_TTL_MS) continue;
      const needsResume = !leaseActive(job, nowMs) ||
        (job.continueLastError !== null && job.continueLastError.length > 0);
      if (!needsResume) continue;
      if (!best || job.createdAtMs > best.createdAtMs) best = job;
    }
    return best ? cloneJob(best) : null;
  }

  async acquireOrCreate(
    input: Omit<
      StagedGenerationJob,
      | "id"
      | "leaseToken"
      | "leaseExpiresMs"
      | "createdAtMs"
      | "updatedAtMs"
      | "stateVersion"
      | "continueLastAtMs"
      | "continueLastError"
      | "finalizeLeaseToken"
      | "finalizeLeaseExpiresMs"
      | "publishRowsInserted"
      | "publishRpcRecordedAtMs"
    >,
    leaseToken: string,
    nowMs: number,
  ): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    if (this.hasActiveGeneration()) {
      return { ok: false, reason: "generation_in_progress" };
    }
    const id = crypto.randomUUID();
    const job: StagedGenerationJob = {
      ...input,
      id,
      merged: input.merged ?? emptyChunkArtifacts(),
      leaseToken,
      leaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      stateVersion: 0,
      continueLastAtMs: null,
      continueLastError: null,
      finalizeLeaseToken: null,
      finalizeLeaseExpiresMs: null,
      nhlBaselineSnapshot: input.nhlBaselineSnapshot ?? null,
      publishRowsInserted: null,
      publishRpcRecordedAtMs: null,
    };
    this.jobs.set(id, job);
    return { ok: true, job: cloneJob(job) };
  }

  async get(id: string): Promise<StagedGenerationJob | null> {
    const job = this.jobs.get(id);
    return job ? cloneJob(job) : null;
  }

  async claimWork(params: {
    jobId: string;
    leaseToken: string;
    nowMs: number;
    mode: "chunk" | "finalize";
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const job = this.jobs.get(params.jobId);
    if (!job) return { ok: false, reason: "generation_not_found" };
    const claimed = claimLeaseInMemory(
      job,
      params.leaseToken,
      params.nowMs,
      params.mode,
    );
    if (!claimed.ok) return claimed;
    this.jobs.set(job.id, job);
    return { ok: true, job: cloneJob(job) };
  }

  async advanceChunk(params: {
    jobId: string;
    leaseToken: string;
    expectedChunkIndex: number;
    expectedStateVersion: number;
    merged: StagedChunkArtifacts;
    nowMs: number;
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const job = this.jobs.get(params.jobId);
    if (!job) return { ok: false, reason: "generation_not_found" };
    const advanced = advanceChunkInMemory(job, {
      leaseToken: params.leaseToken,
      expectedChunkIndex: params.expectedChunkIndex,
      expectedStateVersion: params.expectedStateVersion,
      merged: params.merged,
      nowMs: params.nowMs,
    });
    if (!advanced.ok) return advanced;
    this.jobs.set(job.id, job);
    return { ok: true, job: cloneJob(job) };
  }

  async recordPublishRpc(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    syncRunId: string;
    rowsInserted: number;
    nowMs: number;
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const job = this.jobs.get(params.jobId);
    if (!job) return { ok: false, reason: "generation_not_found" };
    const recorded = recordPublishRpcInMemory(job, params);
    if (!recorded.ok) return recorded;
    this.jobs.set(job.id, job);
    return { ok: true, job: cloneJob(job) };
  }

  async publishStagedGeneration(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    syncRunId: string;
    syncedAt: string;
    nhlBaselineStatus: string;
    tabEvaluationEvidence: unknown;
    rows: unknown[];
    nowMs: number;
  }): Promise<
    | { ok: true; rowsInserted: number; job: StagedGenerationJob }
    | { ok: false; reason: string }
  > {
    const job = this.jobs.get(params.jobId);
    if (!job) return { ok: false, reason: "generation_not_found" };
    const published = publishStagedGenerationInMemory(job, {
      finalizeLeaseToken: params.finalizeLeaseToken,
      expectedStateVersion: params.expectedStateVersion,
      syncRunId: params.syncRunId,
      expectedRowCount: params.rows.length,
      nowMs: params.nowMs,
    });
    if (!published.ok) return published;
    this.jobs.set(job.id, job);
    return {
      ok: true,
      rowsInserted: published.rowsInserted,
      job: cloneJob(job),
    };
  }

  async completePublish(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    nowMs: number;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const job = this.jobs.get(params.jobId);
    if (!job) return { ok: false, reason: "generation_not_found" };
    const done = completePublishInMemory(job, params);
    if (!done.ok) return done;
    this.jobs.set(job.id, job);
    return { ok: true };
  }

  async failJob(jobId: string, reason: string, nowMs: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "failed";
    job.continueLastError = reason;
    job.updatedAtMs = nowMs;
    this.jobs.set(jobId, job);
  }

  async abortJob(jobId: string, nowMs: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "aborted";
    job.leaseToken = null;
    job.leaseExpiresMs = null;
    job.finalizeLeaseToken = null;
    job.finalizeLeaseExpiresMs = null;
    job.updatedAtMs = nowMs;
    this.jobs.set(jobId, job);
  }

  async recordContinueDispatch(params: {
    jobId: string;
    action: string;
    ok: boolean;
    error?: string;
    nowMs: number;
  }): Promise<void> {
    const job = this.jobs.get(params.jobId);
    if (!job) return;
    job.continueLastAtMs = params.nowMs;
    job.continueLastError = params.ok ? null : (params.error ?? "continue_failed");
    job.updatedAtMs = params.nowMs;
    this.jobs.set(params.jobId, job);
  }
}

export function assertJobStatus(
  job: StagedGenerationJob,
  allowed: StagedGenerationStatus[],
): boolean {
  return allowed.includes(job.status);
}
