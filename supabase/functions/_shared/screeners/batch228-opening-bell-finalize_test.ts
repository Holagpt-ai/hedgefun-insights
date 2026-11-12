import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { releaseExpiredFinalizeLeasesBeforeAbort } from "./sync-finalize-recovery.ts";
import { formatFinalizeStageMarker } from "./sync-finalize-diagnostics.ts";
import { buildStagedJobFromUniverse } from "./sync-orchestrator.ts";
import { buildRepresentativeUniverse } from "./sync-screener-cpu-benchmark.ts";
import { stagedJobNeedsResume } from "./sync-staging-resume.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import {
  emptyChunkArtifacts,
  SCREENER_SYNC_CHUNK_SIZE,
  SCREENER_SYNC_JOB_TTL_MS,
  SCREENER_SYNC_LEASE_MS,
} from "./sync-staging-types.ts";

function seedFinalizingAtOpen(
  store: MemorySyncStagingStore,
  createdMs: number,
  leaseExpiresMs: number,
) {
  const universe = buildRepresentativeUniverse(10, "regular", createdMs);
  const base = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    createdMs,
    new Date(createdMs).toISOString(),
    crypto.randomUUID(),
    SCREENER_SYNC_CHUNK_SIZE,
  );
  const jobId = crypto.randomUUID();
  store.seedJob({
    ...base,
    id: jobId,
    status: "finalizing",
    nextChunkIndex: base.totalChunks,
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: createdMs,
    updatedAtMs: createdMs,
    stateVersion: 7,
    continueLastAtMs: createdMs,
    continueLastError: formatFinalizeStageMarker("claim_finalize_lease"),
    finalizeLeaseToken: crypto.randomUUID(),
    finalizeLeaseExpiresMs: leaseExpiresMs,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });
  return jobId;
}

Deno.test("Batch 228: active finalize lease + stage marker alone does not resume", () => {
  const created = Date.parse("2026-11-12T14:30:00.000Z");
  const nowMs = created + 5 * 60_000;
  const job = {
    id: "j",
    status: "finalizing" as const,
    observation: {
      nowMs: created,
      sessionKind: "market" as const,
      extendedSession: true,
      observationSessionFields: true,
      syncedAt: new Date(created).toISOString(),
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
    createdAtMs: created,
    updatedAtMs: created,
    nhlBaselineLoaded: true,
    nhlBaselineSnapshot: null,
    stateVersion: 1,
    continueLastAtMs: created,
    continueLastError: formatFinalizeStageMarker("claim_finalize_lease"),
    finalizeLeaseToken: crypto.randomUUID(),
    finalizeLeaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  };
  assertEquals(stagedJobNeedsResume(job, nowMs), false);
});

Deno.test("Batch 228: release expired finalize lease before abort enables resume", async () => {
  const store = new MemorySyncStagingStore();
  const created = Date.parse("2026-11-12T14:30:00.000Z");
  const leaseExpiredAt = created + SCREENER_SYNC_LEASE_MS;
  const cronNow = leaseExpiredAt + 60_000;
  const jobId = seedFinalizingAtOpen(store, created, leaseExpiredAt);

  const released = await releaseExpiredFinalizeLeasesBeforeAbort(store, cronNow);
  assertEquals(released, 1);

  const n = await store.abortExpired(cronNow);
  assertEquals(n, 0);

  const job = await store.getPreflight(jobId);
  assertEquals(job?.status, "finalizing");
  assertEquals(job?.finalizeLeaseToken, null);
  assertEquals(stagedJobNeedsResume(job!, cronNow), true);
});

Deno.test("Batch 228: without lease release, expired finalize lease is aborted", async () => {
  const store = new MemorySyncStagingStore();
  const created = Date.parse("2026-11-12T14:30:00.000Z");
  const leaseExpiredAt = created + SCREENER_SYNC_LEASE_MS;
  const cronNow = leaseExpiredAt + 60_000;
  const jobId = seedFinalizingAtOpen(store, created, leaseExpiredAt);

  const n = await store.abortExpired(cronNow);
  assertEquals(n, 1);
  const job = await store.getPreflight(jobId);
  assertEquals(job?.status, "aborted");
});

Deno.test("Batch 228: job TTL still aborts unreleased stranded finalize", async () => {
  const store = new MemorySyncStagingStore();
  const created = Date.parse("2026-11-12T14:30:00.000Z");
  const jobId = seedFinalizingAtOpen(
    store,
    created,
    created + SCREENER_SYNC_LEASE_MS,
  );
  const afterJobTtl = created + SCREENER_SYNC_JOB_TTL_MS + 1;
  const n = await store.abortExpired(afterJobTtl);
  assertEquals(n, 1);
  const job = await store.getPreflight(jobId);
  assertEquals(job?.status, "aborted");
});
