import {
  isDefinitiveContinueDispatchFailure,
  releaseFinalizeLeaseCas,
  type ReleaseFinalizeLeaseCas,
} from "./sync-finalize-lease-release.ts";
import { reconcileStrandedPublishedGeneration } from "./sync-staging-post-publish-reconcile.ts";
import type { SyncStagingStore } from "./sync-staging-memory.ts";
import type { StagedGenerationJob } from "./sync-staging-types.ts";

export type FeedSyncRunReader = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        limit: (n: number) => PromiseLike<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export type FinalizeRetryPrep = {
  releasedStaleLease: boolean;
  reconciledComplete: boolean;
};

export async function loadLiveFeedSyncRunId(
  sb: FeedSyncRunReader,
): Promise<string | null> {
  try {
    const res = await sb
      .from("screener_feed_state")
      .select("sync_run_id")
      .eq("state_key", "current")
      .limit(1);
    if (res.error || !res.data?.length) return null;
    const id = res.data[0]?.sync_run_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Before reclaiming finalize work: release stranded leases after a failed dispatch,
 * and finish publish when the RPC already recorded rows on the job.
 */
export async function prepareStagedFinalizeRetry(
  store: SyncStagingStore,
  sb: FeedSyncRunReader,
  job: StagedGenerationJob,
  nowMs: number,
  completePublish: (job: StagedGenerationJob) => Promise<boolean>,
): Promise<FinalizeRetryPrep> {
  const out: FinalizeRetryPrep = {
    releasedStaleLease: false,
    reconciledComplete: false,
  };

  const refreshed = await store.getPreflight(job.id);
  if (!refreshed || refreshed.status === "published") return out;
  const working = refreshed;

  if (
    working.publishRowsInserted !== null &&
    working.status === "finalizing"
  ) {
    out.reconciledComplete = await completePublish(working);
    if (out.reconciledComplete) return out;
    const reconciled = await reconcileStrandedPublishedGeneration(
      store,
      nowMs,
      working,
    );
    out.reconciledComplete = reconciled.ok;
    return out;
  }

  const feedRunId = await loadLiveFeedSyncRunId(sb);
  if (
    feedRunId !== null &&
    feedRunId === working.observation.syncRunId &&
    working.publishRowsInserted === null
  ) {
    const afterRefresh = await store.getPreflight(job.id);
    if (
      afterRefresh &&
      afterRefresh.publishRowsInserted !== null &&
      afterRefresh.status === "finalizing"
    ) {
      out.reconciledComplete = await completePublish(afterRefresh);
      return out;
    }
  }

  if (
    isDefinitiveContinueDispatchFailure(working.continueLastError) &&
    working.status === "finalizing" &&
    working.publishRowsInserted === null &&
    working.finalizeLeaseToken
  ) {
    out.releasedStaleLease = await releaseFinalizeLeaseCas(store, {
      jobId: working.id,
      nowMs,
      expectedStateVersion: working.stateVersion,
      expectedFinalizeLeaseToken: working.finalizeLeaseToken,
      authorization: "dispatch_finalize_failed",
    });
  }

  return out;
}

/**
 * Release stranded finalize leases that expired without a publish record so
 * expire_screener_sync_stale_jobs_v1 does not abort the generation before cron
 * can redispatch finalize (opening-bell recovery; Batch 228).
 */
export async function releaseExpiredFinalizeLeasesBeforeAbort(
  store: SyncStagingStore,
  nowMs: number,
): Promise<number> {
  const stranded = await store.findExpiredFinalizeLeaseJobs(nowMs);
  let released = 0;
  for (const job of stranded) {
    if (!job.finalizeLeaseToken) continue;
    const input: ReleaseFinalizeLeaseCas = {
      jobId: job.id,
      nowMs,
      expectedStateVersion: job.stateVersion,
      expectedFinalizeLeaseToken: job.finalizeLeaseToken,
      authorization: "expired_finalize_lease",
    };
    if (await releaseFinalizeLeaseCas(store, input)) released += 1;
  }
  return released;
}

const CONTINUE_DISPATCH_ERROR_RE = /^[a-z0-9_]{1,120}$/;

/** Bounded publish/claim reason from JSON finalize responses (no secrets or prose). */
export function sanitizeContinueDispatchError(error: unknown): string | null {
  if (typeof error !== "string") return null;
  const trimmed = error.trim();
  if (!trimmed || !CONTINUE_DISPATCH_ERROR_RE.test(trimmed)) return null;
  if (trimmed === "finalize_failed") return null;
  return trimmed;
}

export function parseContinueDispatchError(
  status: number,
  body: unknown,
): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    if (o.error === "finalize_failed") {
      const stage = typeof o.stage === "string" ? o.stage : "unknown";
      const reason = typeof o.reason === "string" ? o.reason : "unknown";
      return `finalize_failed:${stage}:${reason}`;
    }
    const sanitized = sanitizeContinueDispatchError(o.error);
    if (sanitized) return sanitized;
  }
  return `http_${status}`;
}
