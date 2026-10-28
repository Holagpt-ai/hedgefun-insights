import {
  emptyChunkArtifacts,
  SCREENER_SYNC_JOB_TTL_MS,
  SCREENER_SYNC_LEASE_MS,
  type StagedGenerationJob,
  type StagedGenerationStatus,
} from "./sync-staging-types.ts";

export interface SyncStagingStore {
  acquireOrCreate(
    input: Omit<
      StagedGenerationJob,
      "id" | "leaseToken" | "leaseExpiresMs" | "createdAtMs" | "updatedAtMs"
    >,
    leaseToken: string,
    nowMs: number,
  ): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  >;
  get(id: string): Promise<StagedGenerationJob | null>;
  save(job: StagedGenerationJob): Promise<void>;
  abortExpired(nowMs: number): Promise<number>;
}

export class MemorySyncStagingStore implements SyncStagingStore {
  private jobs = new Map<string, StagedGenerationJob>();

  async abortExpired(nowMs: number): Promise<number> {
    let n = 0;
    for (const [id, job] of this.jobs) {
      if (
        job.status === "chunking" &&
        nowMs - job.createdAtMs > SCREENER_SYNC_JOB_TTL_MS
      ) {
        job.status = "aborted";
        job.leaseToken = null;
        job.leaseExpiresMs = null;
        this.jobs.set(id, job);
        n += 1;
      }
    }
    return n;
  }

  async acquireOrCreate(
    input: Omit<
      StagedGenerationJob,
      "id" | "leaseToken" | "leaseExpiresMs" | "createdAtMs" | "updatedAtMs"
    >,
    leaseToken: string,
    nowMs: number,
  ): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    for (const job of this.jobs.values()) {
      if (job.status !== "chunking") continue;
      if (job.leaseExpiresMs !== null && job.leaseExpiresMs > nowMs) {
        return { ok: false, reason: "generation_in_progress" };
      }
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
    };
    this.jobs.set(id, job);
    return { ok: true, job };
  }

  async get(id: string): Promise<StagedGenerationJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async save(job: StagedGenerationJob): Promise<void> {
    job.updatedAtMs = Date.now();
    this.jobs.set(job.id, job);
  }

  renewLease(job: StagedGenerationJob, leaseToken: string, nowMs: number): boolean {
    if (job.leaseToken !== leaseToken && job.leaseExpiresMs !== null &&
      job.leaseExpiresMs > nowMs) {
      return false;
    }
    job.leaseToken = leaseToken;
    job.leaseExpiresMs = nowMs + SCREENER_SYNC_LEASE_MS;
    return true;
  }
}

export function assertJobStatus(
  job: StagedGenerationJob,
  allowed: StagedGenerationStatus[],
): boolean {
  return allowed.includes(job.status);
}
