import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { isUncertainContinueDispatchFailure } from "./sync-finalize-lease-release.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { emptyChunkArtifacts, SCREENER_SYNC_LEASE_MS } from "./sync-staging-types.ts";
import type { StagedGenerationJob } from "./sync-staging-types.ts";

function job(status: StagedGenerationJob["status"] = "finalizing"): StagedGenerationJob {
  const nowMs = Date.parse("2026-11-09T14:30:00.000Z");
  return {
    id: "gen-216",
    status,
    observation: {
      nowMs,
      sessionKind: resolveSyncSessionKind(nowMs),
      extendedSession: false,
      observationSessionFields: true,
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: "run-216",
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 2200,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: "chunk-lease",
    leaseExpiresMs: nowMs + 60_000,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 8,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "finalize-lease",
    finalizeLeaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  };
}

Deno.test("stage marker survives the parent http_546 overwrite and stays uncertain", async () => {
  const store = new MemorySyncStagingStore();
  store.seedJob(job());
  await store.noteFinalizeStage({
    jobId: "gen-216",
    stage: "claim_finalize_lease",
    nowMs: 1,
  });
  await store.noteFinalizeStage({
    jobId: "gen-216",
    stage: "atomic_publish",
    nowMs: 2,
  });
  await store.recordContinueDispatch({
    jobId: "gen-216",
    action: "finalize",
    ok: false,
    error: "http_546",
    nowMs: 3,
  });
  const stored = await store.getPreflight("gen-216");
  assertEquals(stored?.continueLastError, "http_546:finalize_stage:atomic_publish");
  assertEquals(isUncertainContinueDispatchFailure(stored?.continueLastError ?? null), true);
});

Deno.test("stage marker does not replace a real dispatch or publish error", async () => {
  const store = new MemorySyncStagingStore();
  const seeded = job();
  seeded.continueLastError = "finalize_failed:build_rows:type_error";
  store.seedJob(seeded);
  await store.noteFinalizeStage({
    jobId: "gen-216",
    stage: "atomic_publish",
    nowMs: 2,
  });
  assertEquals(
    (await store.getPreflight("gen-216"))?.continueLastError,
    "finalize_failed:build_rows:type_error",
  );
});

Deno.test("published jobs are not stamped with a finalize stage", async () => {
  const store = new MemorySyncStagingStore();
  store.seedJob(job("published"));
  await store.noteFinalizeStage({
    jobId: "gen-216",
    stage: "load_job",
    nowMs: 1,
  });
  assertEquals((await store.getPreflight("gen-216"))?.continueLastError, null);
});
