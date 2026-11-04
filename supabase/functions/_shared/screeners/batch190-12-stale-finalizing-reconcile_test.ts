import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepareStagedFinalizeRetry } from "./sync-finalize-recovery.ts";
import { reconcileStrandedPublishedGeneration } from "./sync-staging-post-publish-reconcile.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { stagedJobNeedsResume } from "./sync-staging-resume.ts";
import {
  SCREENER_SYNC_JOB_TTL_MS,
  SCREENER_SYNC_LEASE_MS,
  emptyChunkArtifacts,
} from "./sync-staging-types.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { isExtendedSyncSession } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import type { StagedGenerationJob } from "./sync-staging-types.ts";
import { buildStagedJobFromUniverse } from "./sync-orchestrator.ts";
import { buildRepresentativeUniverse } from "./sync-screener-cpu-benchmark.ts";

function evaluatedTabEvidence() {
  const evaluated = { status: "evaluated", selected_count: 0, universe_count: 1 };
  return {
    gappers: evaluated,
    gainers_losers: evaluated,
    new_highs_lows: evaluated,
    volume_spikes: evaluated,
    unusual_volume: evaluated,
    day_trade_radar: evaluated,
  };
}

function productionStrandedJob(nowMs: number): StagedGenerationJob {
  const syncRunId = "09346799-d722-437a-bebf-2eea7a6b5cd7";
  const sessionKind = resolveSyncSessionKind(nowMs);
  return {
    id: "2fe9fca8-a9e3-4db5-ab02-25a6dfe7534e",
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind,
      extendedSession: isExtendedSyncSession(sessionKind),
      observationSessionFields: isLiveSurveillanceSessionKind(sessionKind),
      syncedAt: "2026-11-02T10:40:01.704Z",
      syncRunId,
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
    createdAtMs: Date.parse("2026-11-02T10:15:00.000Z"),
    updatedAtMs: nowMs,
    nhlBaselineLoaded: true,
    nhlBaselineSnapshot: null,
    stateVersion: 8,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    finalizeLeaseExpiresMs: Date.parse("2026-11-02T10:52:26.000Z"),
    publishRowsInserted: 65,
    publishRpcRecordedAtMs: Date.parse("2026-11-02T10:40:01.704Z"),
    abortReason: null,
    abortEvidence: null,
  };
}

Deno.test("Batch 190.12: resume beyond TTL when publish recorded and lease expired", () => {
  const nowMs = Date.parse("2026-11-04T16:00:00.000Z");
  const job = productionStrandedJob(nowMs);
  assertEquals(nowMs - job.createdAtMs > SCREENER_SYNC_JOB_TTL_MS, true);
  assertEquals(stagedJobNeedsResume(job, nowMs), true);
});

Deno.test("Batch 190.12: safe reconciliation completes stranded job", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-11-04T16:00:00.000Z");
  const job = productionStrandedJob(nowMs);
  store.seedJob(job);
  store.seedFeedReconcileSnapshot({
    syncRunId: job.observation.syncRunId,
    rowsInserted: 65,
    tabEvaluationEvidence: evaluatedTabEvidence(),
    persistedRowCount: 65,
  });
  const result = await reconcileStrandedPublishedGeneration(store, nowMs);
  assertEquals(result.ok, true);
  if (!result.ok) return;
  const refreshed = await store.get(job.id);
  assertEquals(refreshed?.status, "published");
  const startJob = buildStagedJobFromUniverse(
    buildRepresentativeUniverse(10, "regular", nowMs),
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    crypto.randomUUID(),
    10,
  );
  const acquired = await store.acquireOrCreate(
    startJob,
    crypto.randomUUID(),
    nowMs,
  );
  assertEquals(acquired.ok, true);
});

Deno.test("Batch 190.12: fail closed when live feed generation mismatches", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-11-04T16:00:00.000Z");
  const job = productionStrandedJob(nowMs);
  store.seedJob(job);
  store.seedFeedReconcileSnapshot({
    syncRunId: crypto.randomUUID(),
    rowsInserted: 65,
    tabEvaluationEvidence: evaluatedTabEvidence(),
    persistedRowCount: 65,
  });
  const result = await reconcileStrandedPublishedGeneration(store, nowMs);
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "feed_generation_mismatch");
  const refreshed = await store.get(job.id);
  assertEquals(refreshed?.status, "finalizing");
});

Deno.test("Batch 190.12: prepareStagedFinalizeRetry reconciles after lease-bound complete fails", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-11-04T16:00:00.000Z");
  const job = productionStrandedJob(nowMs);
  store.seedJob(job);
  store.seedFeedReconcileSnapshot({
    syncRunId: job.observation.syncRunId,
    rowsInserted: 65,
    tabEvaluationEvidence: evaluatedTabEvidence(),
    persistedRowCount: 65,
  });
  const feedReader = {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () =>
            Promise.resolve({
              data: [{ sync_run_id: job.observation.syncRunId }],
              error: null,
            }),
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
  assertEquals(prep.reconciledComplete, true);
  const refreshed = await store.get(job.id);
  assertEquals(refreshed?.status, "published");
});

Deno.test("Batch 190.12: concurrent reconcile is idempotent CAS", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-11-04T16:00:00.000Z");
  const job = productionStrandedJob(nowMs);
  store.seedJob(job);
  store.seedFeedReconcileSnapshot({
    syncRunId: job.observation.syncRunId,
    rowsInserted: 65,
    tabEvaluationEvidence: evaluatedTabEvidence(),
    persistedRowCount: 65,
  });
  const [a, b] = await Promise.all([
    reconcileStrandedPublishedGeneration(store, nowMs),
    reconcileStrandedPublishedGeneration(store, nowMs),
  ]);
  assertEquals(a.ok || b.ok, true);
  const refreshed = await store.get(job.id);
  assertEquals(refreshed?.status, "published");
});

Deno.test("Batch 190.12: does not reconcile while finalize lease still active", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-11-02T10:50:00.000Z");
  const job = productionStrandedJob(nowMs);
  job.finalizeLeaseExpiresMs = nowMs + SCREENER_SYNC_LEASE_MS;
  store.seedJob(job);
  store.seedFeedReconcileSnapshot({
    syncRunId: job.observation.syncRunId,
    rowsInserted: 65,
    tabEvaluationEvidence: evaluatedTabEvidence(),
    persistedRowCount: 65,
  });
  const result = await reconcileStrandedPublishedGeneration(store, nowMs);
  assertEquals(result.ok, false);
});
