import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import {
  buildStagedJobFromUniverse,
  runAllChunksInProcess,
  runStagedSyncStep,
} from "./sync-orchestrator.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { SCREENER_SYNC_CHUNK_SIZE, SCREENER_SYNC_JOB_TTL_MS } from "./sync-staging-types.ts";

Deno.test("staging store rejects overlapping generation acquire", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(100, "regular", nowMs);
  const jobInput = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    crypto.randomUUID(),
    SCREENER_SYNC_CHUNK_SIZE,
  );
  const first = await store.acquireOrCreate(jobInput, "lease-a", nowMs);
  assertEquals(first.ok, true);
  const second = await store.acquireOrCreate(jobInput, "lease-b", nowMs + 1);
  assertEquals(second.ok, false);
  if (!second.ok) assertEquals(second.reason, "generation_in_progress");
});

Deno.test("abortExpired marks stale chunking jobs aborted", async () => {
  const store = new MemorySyncStagingStore();
  const created = Date.parse("2026-10-28T14:00:00.000Z");
  const universe = buildRepresentativeUniverse(50, "regular", created);
  const jobInput = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    created,
    new Date(created).toISOString(),
    crypto.randomUUID(),
    SCREENER_SYNC_CHUNK_SIZE,
  );
  const acquired = await store.acquireOrCreate(jobInput, "lease-a", created);
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;
  const expiredNow = created + SCREENER_SYNC_JOB_TTL_MS + 1;
  const n = await store.abortExpired(expiredNow);
  assertEquals(n, 1);
  const job = await store.get(acquired.job.id);
  assertEquals(job?.status, "aborted");
});

Deno.test("continue after all chunks reaches finalizing", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(
    REPRESENTATIVE_UNIVERSE_SIZE,
    "regular",
    nowMs,
  );
  const syncRunId = crypto.randomUUID();
  const jobInput = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    syncRunId,
    SCREENER_SYNC_CHUNK_SIZE,
  );
  const acquired = await store.acquireOrCreate(jobInput, "lease-a", nowMs);
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;
  await runAllChunksInProcess(acquired.job, store, {
    nowMs: () => nowMs,
    newLeaseToken: () => "lease-b",
    nhlBaselines: new Map(),
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
  });
  const refreshed = await store.get(acquired.job.id);
  assertEquals(refreshed?.nextChunkIndex, refreshed?.totalChunks);
  const step = await runStagedSyncStep(
    { action: "continue", generation_id: acquired.job.id },
    null,
    {
      nowMs: () => nowMs,
      newLeaseToken: () => "lease-c",
      store,
      nhlBaselines: new Map(),
      policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
      scheduleContinue: () => {},
    },
  );
  assertEquals(step.phase, "finalizing");
});

Deno.test("continue on unknown generation is skipped", async () => {
  const store = new MemorySyncStagingStore();
  const step = await runStagedSyncStep(
    { action: "continue", generation_id: crypto.randomUUID() },
    null,
    {
      nowMs: () => Date.now(),
      newLeaseToken: () => "x",
      store,
      nhlBaselines: new Map(),
      policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
      scheduleContinue: () => {},
    },
  );
  assertEquals(step.phase, "skipped");
  if (step.phase === "skipped") {
    assertEquals(step.reason, "generation_not_active");
  }
});

Deno.test("continue on aborted job is skipped", async () => {
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
      25,
    ),
    "lease",
    nowMs,
  );
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;
  await store.abortJob(acquired.job.id, nowMs);
  const step = await runStagedSyncStep(
    { action: "continue", generation_id: acquired.job.id },
    null,
    {
      nowMs: () => nowMs,
      newLeaseToken: () => "l2",
      store,
      nhlBaselines: new Map(),
      policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
      scheduleContinue: () => {},
    },
  );
  assertEquals(step.phase, "skipped");
});
