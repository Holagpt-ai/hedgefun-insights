import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildStagedJobFromUniverse } from "./sync-orchestrator.ts";
import { buildRepresentativeUniverse } from "./sync-screener-cpu-benchmark.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import {
  SCREENER_SYNC_CHUNK_SIZE,
  SCREENER_SYNC_JOB_TTL_MS,
  SCREENER_SYNC_LEASE_MS,
} from "./sync-staging-types.ts";

Deno.test("abortExpired releases stranded finalizing job after finalize lease expiry", async () => {
  const store = new MemorySyncStagingStore();
  const created = Date.parse("2026-10-28T14:00:00.000Z");
  const nowMs = created + 5 * 60_000;
  const universe = buildRepresentativeUniverse(10, "regular", created);
  const base = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    created,
    new Date(created).toISOString(),
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
    createdAtMs: created,
    updatedAtMs: created,
    stateVersion: 1,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "fin-a",
    finalizeLeaseExpiresMs: created + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });
  const expiredFinalizeNow = created + SCREENER_SYNC_LEASE_MS + 1;
  const n = await store.abortExpired(expiredFinalizeNow);
  assertEquals(n, 1);
  const job = await store.get(jobId);
  assertEquals(job?.status, "aborted");

  const next = await store.acquireOrCreate(
    buildStagedJobFromUniverse(
      universe,
      [],
      [],
      expiredFinalizeNow,
      new Date(expiredFinalizeNow).toISOString(),
      crypto.randomUUID(),
      SCREENER_SYNC_CHUNK_SIZE,
    ),
    "lease-new",
    expiredFinalizeNow,
  );
  assertEquals(next.ok, true);
});

Deno.test("abortExpired does not abort finalizing job with publish record pending complete", async () => {
  const store = new MemorySyncStagingStore();
  const created = Date.parse("2026-10-28T14:00:00.000Z");
  const universe = buildRepresentativeUniverse(10, "regular", created);
  const base = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    created,
    new Date(created).toISOString(),
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
    createdAtMs: created,
    updatedAtMs: created,
    stateVersion: 2,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "fin-a",
    finalizeLeaseExpiresMs: created + 1,
    publishRowsInserted: 40,
    publishRpcRecordedAtMs: created + 1000,
    abortReason: null,
    abortEvidence: null,
  });
  const afterTtl = created + SCREENER_SYNC_JOB_TTL_MS + 1;
  const n = await store.abortExpired(afterTtl);
  assertEquals(n, 0);
  const job = await store.get(jobId);
  assertEquals(job?.status, "finalizing");
});

Deno.test("publishStagedGeneration is idempotent after record", async () => {
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
    status: "finalizing",
    nextChunkIndex: base.totalChunks,
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
    abortReason: null,
    abortEvidence: null,
  });
  const rows = Array.from({ length: 5 }, (_, i) => ({ i }));
  const first = await store.publishStagedGeneration({
    jobId,
    finalizeLeaseToken: "fin-1",
    expectedStateVersion: 0,
    syncRunId,
    syncedAt: new Date(nowMs).toISOString(),
    nhlBaselineStatus: "initializing",
    tabEvaluationEvidence: {},
    rows,
    nowMs,
  });
  assertEquals(first.ok, true);
  if (!first.ok) return;
  const replay = await store.publishStagedGeneration({
    jobId,
    finalizeLeaseToken: "fin-1",
    expectedStateVersion: 0,
    syncRunId,
    syncedAt: new Date(nowMs).toISOString(),
    nhlBaselineStatus: "initializing",
    tabEvaluationEvidence: {},
    rows,
    nowMs,
  });
  assertEquals(replay.ok, true);
  if (!replay.ok) return;
  assertEquals(replay.rowsInserted, 5);
});
