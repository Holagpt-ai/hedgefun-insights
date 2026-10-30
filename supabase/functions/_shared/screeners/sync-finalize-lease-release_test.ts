import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepareStagedFinalizeRetry } from "./sync-finalize-recovery.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { isExtendedSyncSession } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { SCREENER_SYNC_LEASE_MS } from "./sync-staging-types.ts";

Deno.test("recovery: http_500 dispatch does not release finalize lease", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-30T20:16:00.000Z");
  const sessionKind = resolveSyncSessionKind(nowMs);
  const jobId = crypto.randomUUID();
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
    leaseToken: "a",
    leaseExpiresMs: nowMs + 60_000,
    createdAtMs: nowMs - 120_000,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 7,
    continueLastAtMs: nowMs,
    continueLastError: "http_500",
    finalizeLeaseToken: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    finalizeLeaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });

  const feedReader = {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  };

  const prep = await prepareStagedFinalizeRetry(
    store,
    feedReader,
    (await store.get(jobId))!,
    nowMs,
    async () => false,
  );
  assertEquals(prep.releasedStaleLease, false);
  const job = await store.get(jobId);
  assertEquals(job?.finalizeLeaseToken, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
});

Deno.test("recovery: definitive finalize_failed releases with CAS", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.now();
  const sessionKind = resolveSyncSessionKind(nowMs);
  const token = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const jobId = crypto.randomUUID();
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
    stateVersion: 7,
    continueLastAtMs: nowMs,
    continueLastError: "finalize_failed:build_rows:type_error",
    finalizeLeaseToken: token,
    finalizeLeaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });

  const prep = await prepareStagedFinalizeRetry(
    store,
    {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    },
    (await store.get(jobId))!,
    nowMs,
    async () => false,
  );
  assertEquals(prep.releasedStaleLease, true);
  assertEquals((await store.get(jobId))?.finalizeLeaseToken, null);
});
