import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import {
  buildRepresentativeNhlBaselines,
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";
import {
  buildStagedJobFromUniverse,
  runStagedSyncStep,
} from "./sync-orchestrator.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { SCREENER_SYNC_CHUNK_SIZE } from "./sync-staging-types.ts";
import { finalizeMainUniverseSelections } from "./selection.ts";
import { createSessionVolumeCache } from "./session-volume.ts";
import { isExtendedSyncSession, resolveSyncSessionKind } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { selectMainUniverseTabs } from "./selection.ts";

/** Simulates separate Edge invocations (fresh lease per continue). */
async function runGenerationAsSeparateWorkers(
  store: MemorySyncStagingStore,
  nowMs: number,
): Promise<string> {
  const sessionKind = resolveSyncSessionKind(nowMs);
  const universe = buildRepresentativeUniverse(
    REPRESENTATIVE_UNIVERSE_SIZE,
    "regular",
    nowMs,
  );
  const nhlBaselines = buildRepresentativeNhlBaselines(universe, 26);
  const startJob = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    crypto.randomUUID(),
  );
  let leaseCounter = 0;
  const deps = {
    nowMs: () => nowMs,
    newLeaseToken: () => `lease-${++leaseCounter}`,
    nhlBaselines,
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    scheduleContinue: () => {},
  };

  const first = await runStagedSyncStep({ action: "cron" }, startJob, {
    ...deps,
    store,
  });
  if (first.phase !== "chunk_processed") throw new Error(JSON.stringify(first));

  let job = await store.get(first.generation_id);
  if (!job) throw new Error("job_lost");

  while (job.nextChunkIndex < job.totalChunks) {
    const step = await runStagedSyncStep(
      { action: "continue", generation_id: job.id },
      null,
      { ...deps, store },
    );
    if (step.phase === "skipped") throw new Error(step.reason);
    job = await store.get(job.id);
    if (!job) throw new Error("job_lost");
    assertEquals(job.leaseToken, null);
  }
  return job.id;
}

Deno.test("13262-symbol generation completes across separate worker invocations", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const t0 = performance.now();
  const generationId = await runGenerationAsSeparateWorkers(store, nowMs);
  const elapsed = performance.now() - t0;

  const sessionKind = resolveSyncSessionKind(nowMs);
  const extendedSession = isExtendedSyncSession(sessionKind);
  const observationSessionFields = isLiveSurveillanceSessionKind(sessionKind);
  const cache = createSessionVolumeCache({
    nowMs,
    observationSessionVolume: observationSessionFields,
    extendedSession,
  });
  const opts = {
    extendedSession,
    observationSessionFields,
    nowMs,
    sessionVolumeCache: cache,
  };
  const universe = buildRepresentativeUniverse(
    REPRESENTATIVE_UNIVERSE_SIZE,
    "regular",
    nowMs,
  );
  const monolithic = selectMainUniverseTabs(universe, opts);

  const job = await store.get(generationId);
  if (!job) throw new Error("missing_job");
  assertEquals(job.nextChunkIndex, job.totalChunks);
  const staged = finalizeMainUniverseSelections(job.merged.mainQualified, opts);
  assertEquals(
    staged.day_trade_radar.map((t) => t.ticker).sort(),
    monolithic.day_trade_radar.map((t) => t.ticker).sort(),
  );
  console.log(JSON.stringify({
    multi_worker_chunk_handoff_ms: Math.round(elapsed),
    chunks: job.totalChunks,
    chunk_size: SCREENER_SYNC_CHUNK_SIZE,
  }));
});

Deno.test("second cron cannot start while generation is between chunks", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(100, "regular", nowMs);
  const acquired = await store.acquireOrCreate(
    buildStagedJobFromUniverse(
      universe,
      [],
      [],
      nowMs,
      new Date(nowMs).toISOString(),
      crypto.randomUUID(),
      40,
    ),
    "lease-1",
    nowMs,
  );
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;
  await store.advanceChunk({
    jobId: acquired.job.id,
    leaseToken: "lease-1",
    expectedChunkIndex: 0,
    expectedStateVersion: 0,
    merged: acquired.job.merged,
    nowMs,
  });
  const second = await store.acquireOrCreate(
    buildStagedJobFromUniverse(
      universe,
      [],
      [],
      nowMs,
      new Date(nowMs).toISOString(),
      crypto.randomUUID(),
      40,
    ),
    "lease-2",
    nowMs,
  );
  assertEquals(second.ok, false);
  if (!second.ok) assertEquals(second.reason, "generation_in_progress");
});

Deno.test("single finalize claim: competing finalizer rejected", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(50, "regular", nowMs);
  const acquired = await store.acquireOrCreate(
    buildStagedJobFromUniverse(
      universe,
      [],
      [],
      nowMs,
      new Date(nowMs).toISOString(),
      crypto.randomUUID(),
      50,
    ),
    "lease-1",
    nowMs,
  );
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;
  let job = acquired.job;
  job.nextChunkIndex = job.totalChunks;
  job.status = "finalizing";
  store.seedJob(job);

  const first = await store.claimWork({
    jobId: job.id,
    leaseToken: "fin-1",
    nowMs,
    mode: "finalize",
  });
  assertEquals(first.ok, true);
  const second = await store.claimWork({
    jobId: job.id,
    leaseToken: "fin-2",
    nowMs,
    mode: "finalize",
  });
  assertEquals(second.ok, false);
  if (!second.ok) assertEquals(second.reason, "finalize_owner_conflict");
});

Deno.test("publish RPC record then complete survives retry (crash-safe)", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const syncRunId = crypto.randomUUID();
  const universe = buildRepresentativeUniverse(10, "regular", nowMs);
  const base = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    syncRunId,
    10,
  );
  const jobId = crypto.randomUUID();
  store.seedJob({
    ...base,
    id: jobId,
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    stateVersion: 0,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "fin-1",
    finalizeLeaseExpiresMs: nowMs + 60_000,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    nextChunkIndex: base.totalChunks,
    status: "finalizing",
  });

  const recorded = await store.recordPublishRpc({
    jobId,
    finalizeLeaseToken: "fin-1",
    expectedStateVersion: 0,
    syncRunId,
    rowsInserted: 108,
    nowMs,
  });
  assertEquals(recorded.ok, true);
  if (!recorded.ok) return;

  const completed = await store.completePublish({
    jobId,
    finalizeLeaseToken: "fin-1",
    expectedStateVersion: recorded.job.stateVersion,
    nowMs,
  });
  assertEquals(completed.ok, true);
  const published = await store.get(jobId);
  assertEquals(published?.status, "published");
});
