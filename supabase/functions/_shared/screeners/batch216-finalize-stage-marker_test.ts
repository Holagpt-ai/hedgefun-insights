import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  continueLastErrorAllowsFinalizeStageMarker,
  DURABLE_FINALIZE_STAGE_MARKERS,
  FINALIZE_STAGE_MARKER_WRITE_OR_FILTER,
  formatFinalizeStageMarker,
  isFinalizeStageMarker,
  mergePlatformKillWithFinalizeStage,
  shouldPersistFinalizeStageMarker,
} from "./sync-finalize-diagnostics.ts";
import { isUncertainContinueDispatchFailure } from "./sync-finalize-lease-release.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import {
  createSupabaseSyncStagingStore,
  type StagingTableClient,
} from "./sync-staging-supabase.ts";
import type { StagingJobRow } from "./sync-staging-serialize.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { emptyChunkArtifacts, SCREENER_SYNC_LEASE_MS } from "./sync-staging-types.ts";
import type { StagedGenerationJob } from "./sync-staging-types.ts";
import { serializeMergedArtifacts } from "./sync-staging-serialize.ts";

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

function jobRow(
  id: string,
  status: StagingJobRow["status"],
  nowMs: number,
  continueLastError: string | null = null,
): StagingJobRow {
  return {
    id,
    sync_run_id: "11111111-2222-4333-8444-555555555555",
    status,
    observation: {
      nowMs,
      sessionKind: "pre-market",
      extendedSession: true,
      observationSessionFields: true,
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: "11111111-2222-4333-8444-555555555555",
    },
    all_tickers: [],
    gainers: [],
    losers: [],
    chunk_size: 100,
    next_chunk_index: 7,
    total_chunks: 7,
    merged_artifacts: serializeMergedArtifacts(emptyChunkArtifacts()),
    lease_token: null,
    lease_expires_at: null,
    nhl_baseline_loaded: false,
    nhl_baseline_snapshot: null,
    state_version: 4,
    continue_last_at: null,
    continue_last_error: continueLastError,
    finalize_lease_token: "lease-token",
    finalize_lease_expires_at: new Date(nowMs + 60_000).toISOString(),
    publish_rows_inserted: null,
    publish_rpc_recorded_at: null,
    abort_reason: null,
    abort_evidence: null,
    created_at: new Date(nowMs - 120_000).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
  };
}

function markerAllowsWrite(value: string | null | undefined): boolean {
  if (value == null) return true;
  return value.startsWith("finalize_stage:");
}

/**
 * In-memory PostgREST stand-in that applies the Batch 216.1 conditional
 * marker UPDATE in one round trip (no SELECT).
 */
function conditionalMarkerClient(row: StagingJobRow) {
  let updateCalls = 0;
  let selectCalls = 0;
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                limit: () => {
                  selectCalls += 1;
                  return Promise.resolve({ data: [{ ...row }], error: null });
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq() {
              let statusAllowed: string[] | undefined;
              let orFilter: string | undefined;
              let started = false;
              const execute = async () => {
                if (started) return { error: null };
                started = true;
                updateCalls += 1;
                if (statusAllowed && !statusAllowed.includes(row.status)) {
                  return { error: null };
                }
                if (
                  orFilter === FINALIZE_STAGE_MARKER_WRITE_OR_FILTER &&
                  !markerAllowsWrite(row.continue_last_error)
                ) {
                  return { error: null };
                }
                Object.assign(row, patch);
                return { error: null };
              };
              const builder = {
                in(_col: string, vals: string[]) {
                  statusAllowed = vals;
                  return builder;
                },
                or(filters: string) {
                  orFilter = filters;
                  return builder;
                },
                then(
                  resolve: (value: { error: null }) => unknown,
                  reject?: (reason: unknown) => unknown,
                ) {
                  return execute().then(resolve, reject);
                },
              };
              return builder;
            },
          };
        },
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    client: sb as unknown as StagingTableClient,
    stats: () => ({ updateCalls, selectCalls }),
    row,
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

Deno.test("stage marker does not replace http_546 or other real failures", async () => {
  const store = new MemorySyncStagingStore();
  for (const existing of ["http_546", "http_546:finalize_stage:build_rows", "lease_owner_conflict"]) {
    const seeded = job();
    seeded.id = `gen-${existing}`;
    seeded.continueLastError = existing;
    store.seedJob(seeded);
    await store.noteFinalizeStage({
      jobId: seeded.id,
      stage: "atomic_publish",
      nowMs: 2,
    });
    assertEquals((await store.getPreflight(seeded.id))?.continueLastError, existing);
  }
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

Deno.test("safe marker progression replaces only null or prior markers", async () => {
  const store = new MemorySyncStagingStore();
  store.seedJob(job());
  await store.noteFinalizeStage({
    jobId: "gen-216",
    stage: "claim_finalize_lease",
    nowMs: 1,
  });
  await store.noteFinalizeStage({
    jobId: "gen-216",
    stage: "build_rows",
    nowMs: 2,
  });
  assertEquals(
    (await store.getPreflight("gen-216"))?.continueLastError,
    "finalize_stage:build_rows",
  );
  assertEquals(continueLastErrorAllowsFinalizeStageMarker("finalize_stage:build_rows"), true);
  assertEquals(continueLastErrorAllowsFinalizeStageMarker("http_546"), false);
  assertEquals(shouldPersistFinalizeStageMarker("preserve_check"), false);
  assertEquals(DURABLE_FINALIZE_STAGE_MARKERS.has("atomic_publish"), true);
});

Deno.test("supabase noteFinalizeStage is one conditional UPDATE and never overwrites real errors", async () => {
  const nowMs = Date.parse("2026-11-09T14:30:00.000Z");
  const id = crypto.randomUUID();
  const harness = conditionalMarkerClient(jobRow(id, "finalizing", nowMs));
  const store = createSupabaseSyncStagingStore(harness.client);

  await store.noteFinalizeStage({ jobId: id, stage: "claim_finalize_lease", nowMs });
  assertEquals(harness.row.continue_last_error, "finalize_stage:claim_finalize_lease");
  assertEquals(harness.stats(), { updateCalls: 1, selectCalls: 0 });

  await store.noteFinalizeStage({ jobId: id, stage: "atomic_publish", nowMs: nowMs + 1 });
  assertEquals(harness.row.continue_last_error, "finalize_stage:atomic_publish");
  assertEquals(harness.stats().updateCalls, 2);

  harness.row.continue_last_error = "finalize_failed:build_rows:type_error";
  await store.noteFinalizeStage({ jobId: id, stage: "build_evidence", nowMs: nowMs + 2 });
  assertEquals(harness.row.continue_last_error, "finalize_failed:build_rows:type_error");
  assertEquals(harness.stats().updateCalls, 3);
  assertEquals(harness.stats().selectCalls, 0);
});

Deno.test("concurrent real error beats a late marker write", async () => {
  const nowMs = Date.parse("2026-11-09T14:30:00.000Z");
  const id = crypto.randomUUID();
  const harness = conditionalMarkerClient(
    jobRow(id, "finalizing", nowMs, "finalize_stage:claim_finalize_lease"),
  );
  const store = createSupabaseSyncStagingStore(harness.client);

  // Simulate another writer landing a real error before the marker UPDATE runs.
  harness.row.continue_last_error = "http_546";
  await store.noteFinalizeStage({ jobId: id, stage: "atomic_publish", nowMs: nowMs + 1 });
  assertEquals(harness.row.continue_last_error, "http_546");
  assertEquals(isFinalizeStageMarker(harness.row.continue_last_error), false);
});

Deno.test("http_546 dispatch retains the stage with one marker SELECT only on kill path", async () => {
  const nowMs = Date.parse("2026-11-09T14:30:00.000Z");
  const id = crypto.randomUUID();
  const harness = conditionalMarkerClient(
    jobRow(id, "finalizing", nowMs, "finalize_stage:atomic_publish"),
  );
  const store = createSupabaseSyncStagingStore(harness.client);

  await store.recordContinueDispatch({
    jobId: id,
    action: "finalize",
    ok: false,
    error: "http_546",
    nowMs: nowMs + 1,
  });
  assertEquals(harness.row.continue_last_error, "http_546:finalize_stage:atomic_publish");
  assertEquals(harness.stats().selectCalls, 1);

  const before = harness.stats().selectCalls;
  await store.recordContinueDispatch({
    jobId: id,
    action: "finalize",
    ok: false,
    error: "lease_owner_conflict",
    nowMs: nowMs + 2,
  });
  assertEquals(harness.row.continue_last_error, "lease_owner_conflict");
  assertEquals(harness.stats().selectCalls, before);
});

Deno.test("diagnostics helpers keep merge and filter bounds", () => {
  assertEquals(
    mergePlatformKillWithFinalizeStage("http_546", formatFinalizeStageMarker("atomic_publish")),
    "http_546:finalize_stage:atomic_publish",
  );
  assertEquals(
    FINALIZE_STAGE_MARKER_WRITE_OR_FILTER,
    "continue_last_error.is.null,continue_last_error.like.finalize_stage:*",
  );
});
