/**
 * Batch 190.12 Postgres integration — reconcile_screener_sync_staged_publish_v1.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applySqlFile,
  assertStagingRpcIntendedAcl,
} from "./sync-staging-postgres-acl-helpers.ts";
import {
  sampleObservation,
  truncateStaging,
  validScreenerRow,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

const RECONCILE_MIGRATION = new URL(
  "../../../migrations/20261104120000_screener_sync_stale_finalizing_reconcile_v1.sql",
  import.meta.url,
);

const RECONCILE_RPC =
  "reconcile_screener_sync_staged_publish_v1(uuid,integer,timestamptz)";

function fullTabEvidence() {
  const evaluated = {
    status: "evaluated",
    selected_count: 1,
    universe_count: 1,
    qualified_count: 1,
  };
  return {
    gappers: evaluated,
    gainers_losers: evaluated,
    new_highs_lows: evaluated,
    volume_spikes: evaluated,
    unusual_volume: evaluated,
    day_trade_radar: evaluated,
  };
}

async function ensureReconcileRpc(client: import("https://deno.land/x/postgres@v0.19.3/mod.ts").Client): Promise<void> {
  const exists = await client.queryObject<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'reconcile_screener_sync_staged_publish_v1'`,
  );
  if ((exists.rows[0]?.n ?? 0) === 0) {
    await applySqlFile(client, RECONCILE_MIGRATION);
  }
}

Deno.test("postgres gate: reconcile RPC ACL service_role only", async () => {
  await withPg(async (client) => {
    await ensureReconcileRpc(client);
    await assertStagingRpcIntendedAcl(client, RECONCILE_RPC);
  });
});

Deno.test("postgres gate: reconcile completes stranded finalizing after publish record", async () => {
  await withPg(async (client) => {
    await ensureReconcileRpc(client);
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const syncedAt = "2026-11-02T10:40:01.704Z";
    const evidence = fullTabEvidence();
    const rows = [validScreenerRow("AAA", "gappers", syncedAt)];
    await client.queryObject(
      `SELECT public.replace_screener_results_generation_v1(
        $1::jsonb, $2::uuid, $3::timestamptz, 'available', $4::jsonb
      )`,
      [JSON.stringify(rows), syncRunId, syncedAt, JSON.stringify(evidence)],
    );
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, state_version, publish_rows_inserted, publish_rpc_recorded_at,
        finalize_lease_token, finalize_lease_expires_at)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 8, 1,
               $4::timestamptz, $5::uuid, $6::timestamptz)`,
      [
        jobId,
        syncRunId,
        JSON.stringify({ ...sampleObservation(syncRunId), syncedAt }),
        syncedAt,
        crypto.randomUUID(),
        "2026-11-02T10:52:26.000Z",
      ],
    );
    const reconcile = await client.queryObject<{ payload: string }>(
      `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
      [jobId],
    );
    const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
    assertEquals(parsed.ok, true);
    const status = await client.queryObject<{ status: string }>(
      `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [jobId],
    );
    assertEquals(status.rows[0]?.status, "published");
    let blocked = false;
    try {
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
         VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, 1)`,
        [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(sampleObservation(crypto.randomUUID()))],
      );
    } catch {
      blocked = true;
    }
    assertEquals(blocked, false);
  });
});

Deno.test("postgres gate: reconcile rejects NULL finalize lease expiry", async () => {
  await withPg(async (client) => {
    await ensureReconcileRpc(client);
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const syncedAt = "2026-11-02T10:40:01.704Z";
    const evidence = fullTabEvidence();
    await client.queryObject(
      `SELECT public.replace_screener_results_generation_v1(
        $1::jsonb, $2::uuid, $3::timestamptz, 'available', $4::jsonb
      )`,
      [
        JSON.stringify([validScreenerRow("NULL", "gappers", syncedAt)]),
        syncRunId,
        syncedAt,
        JSON.stringify(evidence),
      ],
    );
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, state_version, publish_rows_inserted, publish_rpc_recorded_at,
        finalize_lease_expires_at)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 8, 1,
               now() - interval '2 days', NULL)`,
      [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId))],
    );
    const reconcile = await client.queryObject<{ payload: string }>(
      `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
      [jobId],
    );
    const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
    assertEquals(parsed.ok, false);
    assertEquals(parsed.reason, "finalize_lease_expiry_missing");
  });
});

Deno.test("postgres gate: reconcile rejects active finalize lease", async () => {
  await withPg(async (client) => {
    await ensureReconcileRpc(client);
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const syncedAt = "2026-11-02T10:40:01.704Z";
    const evidence = fullTabEvidence();
    await client.queryObject(
      `SELECT public.replace_screener_results_generation_v1(
        $1::jsonb, $2::uuid, $3::timestamptz, 'available', $4::jsonb
      )`,
      [
        JSON.stringify([validScreenerRow("ACT", "gappers", syncedAt)]),
        syncRunId,
        syncedAt,
        JSON.stringify(evidence),
      ],
    );
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, state_version, publish_rows_inserted, publish_rpc_recorded_at,
        finalize_lease_token, finalize_lease_expires_at)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 8, 1,
               now() - interval '2 days', $4::uuid, now() + interval '10 minutes')`,
      [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), crypto.randomUUID()],
    );
    const reconcile = await client.queryObject<{ payload: string }>(
      `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
      [jobId],
    );
    const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
    assertEquals(parsed.ok, false);
    assertEquals(parsed.reason, "finalize_lease_still_active");
  });
});

Deno.test("postgres gate: reconcile fail closed on feed generation mismatch", async () => {
  await withPg(async (client) => {
    await ensureReconcileRpc(client);
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const otherRun = crypto.randomUUID();
    const syncedAt = "2026-11-02T10:40:01.704Z";
    const evidence = fullTabEvidence();
    await client.queryObject(
      `SELECT public.replace_screener_results_generation_v1(
        $1::jsonb, $2::uuid, $3::timestamptz, 'available', $4::jsonb
      )`,
      [
        JSON.stringify([validScreenerRow("BBB", "gappers", syncedAt)]),
        otherRun,
        syncedAt,
        JSON.stringify(evidence),
      ],
    );
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, state_version, publish_rows_inserted, publish_rpc_recorded_at,
        finalize_lease_expires_at)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 8, 1,
               now() - interval '2 days', now() - interval '1 day')`,
      [
        jobId,
        syncRunId,
        JSON.stringify(sampleObservation(syncRunId)),
      ],
    );
    const reconcile = await client.queryObject<{ payload: string }>(
      `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
      [jobId],
    );
    const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
    assertEquals(parsed.ok, false);
    assertEquals(parsed.reason, "feed_generation_mismatch");
  });
});
