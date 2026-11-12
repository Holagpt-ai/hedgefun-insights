import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { releaseExpiredFinalizeLeasesBeforeAbort } from "./sync-finalize-recovery.ts";
import {
  createSupabaseSyncStagingStore,
  type StagingSelectFilterChain,
  type StagingTableClient,
} from "./sync-staging-supabase.ts";
import type { StagingJobRow } from "./sync-staging-serialize.ts";
import { serializeMergedArtifacts } from "./sync-staging-serialize.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";

function sampleRow(expired: boolean): StagingJobRow {
  const now = Date.parse("2026-11-12T14:30:00.000Z");
  const syncRunId = "11111111-2222-4333-8444-555555555555";
  return {
    id: "22222222-3333-4444-8555-666666666666",
    sync_run_id: syncRunId,
    status: "finalizing",
    observation: {
      nowMs: now,
      sessionKind: resolveSyncSessionKind(now),
      extendedSession: true,
      observationSessionFields: true,
      syncedAt: new Date(now).toISOString(),
      syncRunId,
    },
    all_tickers: [],
    gainers: [],
    losers: [],
    chunk_size: 2200,
    next_chunk_index: 7,
    total_chunks: 7,
    merged_artifacts: serializeMergedArtifacts(emptyChunkArtifacts()),
    lease_token: null,
    lease_expires_at: null,
    nhl_baseline_loaded: true,
    nhl_baseline_snapshot: null,
    state_version: 9,
    continue_last_at: new Date(now).toISOString(),
    continue_last_error: "finalize_stage:claim_finalize_lease",
    finalize_lease_token: "33333333-4444-4555-8666-777777777777",
    finalize_lease_expires_at: new Date(
      expired ? now - 60_000 : now + 600_000,
    ).toISOString(),
    publish_rows_inserted: null,
    publish_rpc_recorded_at: null,
    abort_reason: null,
    abort_evidence: null,
    created_at: new Date(now - 120_000).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
}

function fluentSelectMock(
  rows: StagingJobRow[],
  onLimit: (filters: string[], limit: number) => void,
): StagingTableClient {
  const filters: string[] = [];
  const chain: StagingSelectFilterChain = {
    eq(col, val) {
      filters.push(`eq:${col}=${val}`);
      return chain;
    },
    is(col, _val) {
      filters.push(`is:${col}=null`);
      return chain;
    },
    not(col, op, _val) {
      filters.push(`not:${col}:${op}`);
      return chain;
    },
    lt(col, val) {
      filters.push(`lt:${col}=${val}`);
      return chain;
    },
    gt(col, val) {
      filters.push(`gt:${col}=${val}`);
      return chain;
    },
    in(col, vals) {
      filters.push(`in:${col}=${vals.length}`);
      return chain;
    },
    limit(n) {
      onLimit([...filters], n);
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const sb = {
    from() {
      return {
        select() {
          return chain;
        },
        insert: () => Promise.resolve({ error: null }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    },
    rpc(fn: string, _args: Record<string, unknown>) {
      if (fn === "release_screener_sync_finalize_lease_cas_v1") {
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return sb as unknown as StagingTableClient;
}

Deno.test("Batch 228 supabase: findExpiredFinalizeLeaseJobs uses bounded PostgREST filters", async () => {
  let capturedLimit = 0;
  const row = sampleRow(true);
  const sb = fluentSelectMock([row], (filters, limit) => {
    capturedLimit = limit;
    assertEquals(filters.includes("eq:status=finalizing"), true);
    assertEquals(filters.includes("is:publish_rows_inserted=null"), true);
    assertEquals(filters.includes("not:finalize_lease_expires_at:is"), true);
    assertEquals(filters.some((f) => f.startsWith("lt:finalize_lease_expires_at=")), true);
  });
  const store = createSupabaseSyncStagingStore(sb);
  const jobs = await store.findExpiredFinalizeLeaseJobs(
    Date.parse("2026-11-12T14:35:00.000Z"),
  );
  assertEquals(jobs.length, 1);
  assertEquals(jobs[0]?.id, row.id);
  assertEquals(capturedLimit, 16);
});

Deno.test("Batch 228 supabase: releaseExpiredFinalizeLeases skips active lease rows", async () => {
  const sb = fluentSelectMock([], () => {});
  const store = createSupabaseSyncStagingStore(sb);
  const released = await releaseExpiredFinalizeLeasesBeforeAbort(
    store,
    Date.parse("2026-11-12T14:35:00.000Z"),
  );
  assertEquals(released, 0);
});

Deno.test("Batch 228 supabase: CAS release before abort leaves generation resumable", async () => {
  const row = sampleRow(true);
  let releaseCalls = 0;
  const base = fluentSelectMock([row], () => {});
  const sb = {
    ...base,
    rpc: (fn: string) => {
      if (fn === "release_screener_sync_finalize_lease_cas_v1") {
        releaseCalls += 1;
        row.finalize_lease_token = null;
        row.finalize_lease_expires_at = null;
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      if (fn === "expire_screener_sync_stale_jobs_v1") {
        return Promise.resolve({ data: { ok: true, aborted_count: 0 }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as StagingTableClient;
  const store = createSupabaseSyncStagingStore(sb);
  const released = await releaseExpiredFinalizeLeasesBeforeAbort(
    store,
    Date.parse("2026-11-12T14:35:00.000Z"),
  );
  assertEquals(released, 1);
  assertEquals(releaseCalls, 1);
  const aborted = await store.abortExpired(Date.parse("2026-11-12T14:35:00.000Z"));
  assertEquals(aborted, 0);
});

Deno.test("Batch 228 supabase: release RPC failure does not throw; expiry may still abort", async () => {
  const row = sampleRow(true);
  const innerFail = fluentSelectMock([row], () => {}) as unknown as {
    rpc: (fn: string) => Promise<{ data: unknown; error: null }>;
  };
  const sb = {
    ...innerFail,
    rpc: (fn: string) => {
    if (fn === "release_screener_sync_finalize_lease_cas_v1") {
      return Promise.resolve({ data: { ok: false, reason: "release_cas_rejected" }, error: null });
    }
    if (fn === "expire_screener_sync_stale_jobs_v1") {
      return Promise.resolve({ data: { ok: true, aborted_count: 1 }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
    },
  } as unknown as StagingTableClient;
  const store = createSupabaseSyncStagingStore(sb);
  const released = await releaseExpiredFinalizeLeasesBeforeAbort(
    store,
    Date.parse("2026-11-12T14:35:00.000Z"),
  );
  assertEquals(released, 0);
  const aborted = await store.abortExpired(Date.parse("2026-11-12T14:35:00.000Z"));
  assertEquals(aborted, 1);
});
