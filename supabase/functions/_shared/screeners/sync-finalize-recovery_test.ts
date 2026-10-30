import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseContinueDispatchError } from "./sync-finalize-recovery.ts";
import { prepareStagedFinalizeRetry } from "./sync-finalize-recovery.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { isExtendedSyncSession } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { SCREENER_SYNC_LEASE_MS, emptyChunkArtifacts } from "./sync-staging-types.ts";
import type { StagedGenerationJob } from "./sync-staging-types.ts";

Deno.test("dispatch error parser: structured finalize_failed body", () => {
  const err = parseContinueDispatchError(503, {
    error: "finalize_failed",
    stage: "atomic_publish",
    reason: "type_error",
  });
  assertEquals(err, "finalize_failed:atomic_publish:type_error");
});

Deno.test("dispatch error parser: falls back to http status", () => {
  assertEquals(parseContinueDispatchError(500, null), "http_500");
});

Deno.test("recovery: releases finalize lease after definitive dispatch failure", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-30T20:16:00.000Z");
  const sessionKind = resolveSyncSessionKind(nowMs);
  const job: StagedGenerationJob = {
    id: crypto.randomUUID(),
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind,
      extendedSession: isExtendedSyncSession(sessionKind),
      observationSessionFields: isLiveSurveillanceSessionKind(sessionKind),
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: crypto.randomUUID(),
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 2200,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: "aaaa",
    leaseExpiresMs: nowMs + 60_000,
    createdAtMs: nowMs - 120_000,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 7,
    continueLastAtMs: nowMs,
    continueLastError: "finalize_failed:build_rows:type_error",
    finalizeLeaseToken: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    finalizeLeaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  };
  store.seedJob(job);

  const feedReader = {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () =>
            Promise.resolve({ data: [{ sync_run_id: "other-run" }], error: null }),
        }),
      }),
    }),
  };

  const prep = await prepareStagedFinalizeRetry(
    store,
    feedReader,
    job,
    nowMs,
    async () => false,
  );
  assertEquals(prep.releasedStaleLease, true);
  const refreshed = await store.get(job.id);
  assertEquals(refreshed?.finalizeLeaseToken, null);
  assertEquals(refreshed?.finalizeLeaseExpiresMs, null);
});

Deno.test("recovery: does not release lease when publish rows already recorded", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.now();
  const jobId = crypto.randomUUID();
  const sessionKind = resolveSyncSessionKind(nowMs);
  store.seedJob({
    id: jobId,
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind,
      extendedSession: isExtendedSyncSession(sessionKind),
      observationSessionFields: isLiveSurveillanceSessionKind(sessionKind),
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: crypto.randomUUID(),
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 2200,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 8,
    continueLastAtMs: nowMs,
    continueLastError: "http_500",
    finalizeLeaseToken: "keep",
    finalizeLeaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: 108,
    publishRpcRecordedAtMs: nowMs,
    abortReason: null,
    abortEvidence: null,
  });

  const released = await store.releaseFinalizeLeasesForRetry({
    jobId,
    nowMs,
    expectedStateVersion: 8,
    expectedFinalizeLeaseToken: "keep",
    authorization: "in_process_finalize_exception",
  });
  assertEquals(released, false);
});
