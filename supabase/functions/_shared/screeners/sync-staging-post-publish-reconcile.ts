import type { SyncStagingStore } from "./sync-staging-memory.ts";
import type { StagedGenerationJob } from "./sync-staging-types.ts";
import { finalizeLeaseActive } from "./sync-staging-cas.ts";

export type ReconcileStagedPublishResult =
  | { ok: true; jobId: string; idempotent?: boolean }
  | { ok: false; reason: string };

export function jobEligibleForPostPublishReconcile(
  job: StagedGenerationJob,
  nowMs: number,
): boolean {
  if (job.status !== "finalizing") return false;
  if (job.publishRowsInserted === null || job.publishRpcRecordedAtMs === null) {
    return false;
  }
  if (job.nextChunkIndex < job.totalChunks) return false;
  if (job.finalizeLeaseExpiresMs === null) return false;
  if (finalizeLeaseActive(job, nowMs)) return false;
  return true;
}

/**
 * Attempt to mark a stranded finalizing job published after atomic replace succeeded
 * but lease-bound completion did not run (ISS-034 / Batch 190.12).
 */
export async function reconcileStrandedPublishedGeneration(
  store: SyncStagingStore,
  nowMs: number,
  jobHint?: StagedGenerationJob | null,
): Promise<ReconcileStagedPublishResult> {
  const job = jobHint ?? await store.findPostPublishReconcileCandidate(nowMs);
  if (!job || !jobEligibleForPostPublishReconcile(job, nowMs)) {
    return { ok: false, reason: "no_reconcile_candidate" };
  }
  return store.reconcileStagedPublish({
    jobId: job.id,
    expectedStateVersion: job.stateVersion,
    nowMs,
  });
}
