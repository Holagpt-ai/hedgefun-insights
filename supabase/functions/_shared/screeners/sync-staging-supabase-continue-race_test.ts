import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createSupabaseSyncStagingStore,
  type StagingTableClient,
} from "./sync-staging-supabase.ts";
import type { StagingJobRow } from "./sync-staging-serialize.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import { serializeMergedArtifacts } from "./sync-staging-serialize.ts";

function jobRow(
  id: string,
  status: StagingJobRow["status"],
  nowMs: number,
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
    continue_last_error: null,
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

/**
 * In-memory table whose error update honors `.in("status", ...)`.
 * The first metadata write invokes real `failJob` before it returns, which is
 * the window between a stale status observation and the error UPDATE.
 */
function racingClient(row: StagingJobRow, onMetadataWrite?: () => Promise<void>) {
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                limit: () => Promise.resolve({ data: [{ ...row }], error: null }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq() {
              let allowed: string[] | undefined;
              let started = false;
              const execute = async () => {
                if (started) return { error: null };
                started = true;
                if (
                  onMetadataWrite &&
                  patch.continue_last_at !== undefined &&
                  patch.continue_last_error === undefined &&
                  patch.status === undefined
                ) {
                  const hook = onMetadataWrite;
                  onMetadataWrite = undefined;
                  await hook();
                }
                if (allowed && !allowed.includes(row.status)) {
                  return { error: null };
                }
                Object.assign(row, patch);
                return { error: null };
              };
              const builder = {
                in(_col: string, vals: string[]) {
                  allowed = vals;
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
  return sb as unknown as StagingTableClient;
}

Deno.test("Batch 190.10: failJob between dispatch read and update keeps terminal reason", async () => {
  const nowMs = Date.parse("2026-11-02T09:00:00.000Z");
  const id = crypto.randomUUID();
  const row = jobRow(id, "finalizing", nowMs);
  let store!: ReturnType<typeof createSupabaseSyncStagingStore>;
  const sb = racingClient(row, async () => {
    await store.failJob(id, "state_version_conflict", nowMs);
  });
  store = createSupabaseSyncStagingStore(sb);
  await store.recordContinueDispatch({
    jobId: id,
    action: "finalize",
    ok: false,
    error: "http_409",
    nowMs: nowMs + 5,
  });
  assertEquals(row.status, "failed");
  assertEquals(row.continue_last_error, "state_version_conflict");
  const job = await store.get(id);
  assertEquals(job?.continueLastError, "state_version_conflict");
  assertEquals(job?.status, "failed");
});

Deno.test("Batch 190.10: nonterminal dispatch error is recorded by status predicate", async () => {
  const nowMs = Date.parse("2026-11-02T14:30:00.000Z");
  const id = crypto.randomUUID();
  const row = jobRow(id, "chunking", nowMs);
  const store = createSupabaseSyncStagingStore(racingClient(row));
  await store.recordContinueDispatch({
    jobId: id,
    action: "continue",
    ok: false,
    error: "lease_owner_conflict",
    nowMs,
  });
  assertEquals(row.status, "chunking");
  assertEquals(row.continue_last_error, "lease_owner_conflict");
  assertEquals(row.continue_last_at, new Date(nowMs).toISOString());
  const job = await store.get(id);
  assertEquals(job?.continueLastError, "lease_owner_conflict");
});
