import { finalizeLeaseActive, leaseActive } from "./sync-staging-cas.ts";
import {
  SCREENER_SYNC_JOB_TTL_MS,
  type StagedGenerationJob,
} from "./sync-staging-types.ts";

/** Whether cron/continue should retry this in-progress generation. */
export function stagedJobNeedsResume(
  job: StagedGenerationJob,
  nowMs: number,
  jobTtlMs: number = SCREENER_SYNC_JOB_TTL_MS,
): boolean {
  if (job.status !== "chunking" && job.status !== "finalizing") return false;
  if (nowMs - job.createdAtMs > jobTtlMs) return false;
  if (job.continueLastError !== null && job.continueLastError.length > 0) {
    return true;
  }
  if (job.status === "finalizing") {
    if (finalizeLeaseActive(job, nowMs)) return false;
    return true;
  }
  return !leaseActive(job, nowMs);
}
