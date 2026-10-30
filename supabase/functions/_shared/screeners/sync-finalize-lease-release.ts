import type { SyncStagingStore } from "./sync-staging-memory.ts";

export type ReleaseFinalizeLeaseAuthorization =
  | "in_process_finalize_exception"
  | "dispatch_finalize_failed";

export type ReleaseFinalizeLeaseCas = {
  jobId: string;
  nowMs: number;
  expectedStateVersion: number;
  expectedFinalizeLeaseToken: string;
  authorization: ReleaseFinalizeLeaseAuthorization;
};

/** Definitive off-box finalize failure (structured 503 body). Not HTTP timeout/500 alone. */
export function isDefinitiveContinueDispatchFailure(
  continueLastError: string | null,
): boolean {
  if (!continueLastError || continueLastError.length === 0) return false;
  if (continueLastError.startsWith("finalize_failed:")) return true;
  if (continueLastError.startsWith("http_")) return false;
  if (/timeout|timed out|abort|network|fetch failed/i.test(continueLastError)) {
    return false;
  }
  return false;
}

export function isUncertainContinueDispatchFailure(
  continueLastError: string | null,
): boolean {
  if (!continueLastError) return false;
  if (continueLastError.startsWith("http_")) return true;
  return /timeout|timed out|abort/i.test(continueLastError);
}

export async function releaseFinalizeLeaseCas(
  store: SyncStagingStore,
  input: ReleaseFinalizeLeaseCas,
): Promise<boolean> {
  if (!input.expectedFinalizeLeaseToken) return false;
  return store.releaseFinalizeLeasesForRetry(input);
}
