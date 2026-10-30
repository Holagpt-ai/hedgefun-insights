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

  const refreshed = await store.get(job.id);
  if (!refreshed || refreshed.status === "published") return out;
  const working = refreshed;

  if (
    working.publishRowsInserted !== null &&
    working.status === "finalizing"
  ) {
    out.reconciledComplete = await completePublish(working);
    return out;
  }

  const feedRunId = await loadLiveFeedSyncRunId(sb);
  if (
    feedRunId !== null &&
    feedRunId === working.observation.syncRunId &&
    working.publishRowsInserted === null
  ) {
    const afterRefresh = await store.get(job.id);
    if (
      afterRefresh &&
      afterRefresh.publishRowsInserted !== null &&
      afterRefresh.status === "finalizing"
    ) {
      out.reconciledComplete = await completePublish(afterRefresh);
      return out;
    }
  }

  const dispatchFailed = working.continueLastError !== null &&
    working.continueLastError.length > 0;
  if (
    dispatchFailed &&
    working.status === "finalizing" &&
    working.publishRowsInserted === null
  ) {
    out.releasedStaleLease = await store.releaseFinalizeLeasesForRetry(
      working.id,
      nowMs,
    );
  }

  return out;
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
    if (typeof o.error === "string" && o.error.length > 0) {
      return truncateContinueError(o.error);
    }
  }
  return `http_${status}`;
}

function truncateContinueError(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length <= 200 ? trimmed : trimmed.slice(0, 200);
}
