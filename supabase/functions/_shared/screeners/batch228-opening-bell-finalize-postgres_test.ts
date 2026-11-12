import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stagedJobNeedsResume } from "./sync-staging-resume.ts";
import { jobFromRow } from "./sync-staging-serialize.ts";
import {
  sampleObservation,
  truncateStaging,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

Deno.test({
  name: "postgres Batch 228: expired finalize lease query matches stranded row",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, finalize_lease_token, finalize_lease_expires_at,
          publish_rows_inserted, created_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7,
                 $4::uuid, now() - interval '2 minutes', NULL,
                 now() - interval '8 minutes')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const rows = await client.queryObject<{
        id: string;
        finalize_lease_expires_at: string;
      }>(
        `SELECT id, finalize_lease_expires_at
         FROM public.screener_sync_generation_jobs
         WHERE status = 'finalizing'
           AND publish_rows_inserted IS NULL
           AND finalize_lease_expires_at IS NOT NULL
           AND finalize_lease_expires_at < now()
         LIMIT 16`,
      );
      assertEquals(rows.rows.length, 1);
      assertEquals(rows.rows[0]?.id, jobId);
    });
  },
});

Deno.test({
  name: "postgres Batch 228: CAS release before expire preserves generation for resume",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, finalize_lease_token, finalize_lease_expires_at,
          publish_rows_inserted, created_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7,
                 $4::uuid, now() - interval '1 minute', NULL,
                 now() - interval '8 minutes')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const release = await client.queryObject<{ payload: string }>(
        `SELECT public.release_screener_sync_finalize_lease_cas_v1(
          $1::uuid, 7, $2::uuid, now()
        )::text AS payload`,
        [jobId, lease],
      );
      assertEquals(JSON.parse(String(release.rows[0]?.payload ?? "{}")).ok, true);

      const expired = await client.queryObject<{ payload: string }>(
        `SELECT public.expire_screener_sync_stale_jobs_v1(now(), interval '25 minutes')::text AS payload`,
      );
      const payload = JSON.parse(String(expired.rows[0]?.payload ?? "{}"));
      assertEquals(payload.aborted_count, 0);

      const row = await client.queryObject<Record<string, unknown>>(
        `SELECT id, sync_run_id, status, observation, all_tickers, gainers, losers,
                chunk_size, next_chunk_index, total_chunks, merged_artifacts,
                lease_token, lease_expires_at, nhl_baseline_loaded, nhl_baseline_snapshot,
                state_version, continue_last_at, continue_last_error,
                finalize_lease_token, finalize_lease_expires_at,
                publish_rows_inserted, publish_rpc_recorded_at,
                abort_reason, abort_evidence, created_at, updated_at
         FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "finalizing");
      assertEquals(row.rows[0]?.publish_rows_inserted, null);
      assertEquals(row.rows[0]?.finalize_lease_token, null);
      const job = jobFromRow(row.rows[0] as import("./sync-staging-serialize.ts").StagingJobRow);
      assertEquals(stagedJobNeedsResume(job, Date.now()), true);
    });
  },
});

Deno.test({
  name: "postgres Batch 228: rejects release with wrong finalize token",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, finalize_lease_token, finalize_lease_expires_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7,
                 $4::uuid, now() - interval '1 minute')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const res = await client.queryObject<{ payload: string }>(
        `SELECT public.release_screener_sync_finalize_lease_cas_v1(
          $1::uuid, 7, $2::uuid, now()
        )::text AS payload`,
        [jobId, crypto.randomUUID()],
      );
      assertEquals(JSON.parse(String(res.rows[0]?.payload ?? "{}")).ok, false);
    });
  },
});

Deno.test({
  name: "postgres Batch 228: rejects release with stale state version",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, finalize_lease_token, finalize_lease_expires_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 8,
                 $4::uuid, now() - interval '1 minute')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const res = await client.queryObject<{ payload: string }>(
        `SELECT public.release_screener_sync_finalize_lease_cas_v1(
          $1::uuid, 7, $2::uuid, now()
        )::text AS payload`,
        [jobId, lease],
      );
      assertEquals(JSON.parse(String(res.rows[0]?.payload ?? "{}")).ok, false);
    });
  },
});

Deno.test({
  name: "postgres Batch 228: active non-expired lease excluded from expired query",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, finalize_lease_token, finalize_lease_expires_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7,
                 $4::uuid, now() + interval '10 minutes')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const rows = await client.queryObject<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM public.screener_sync_generation_jobs
         WHERE status = 'finalizing'
           AND publish_rows_inserted IS NULL
           AND finalize_lease_expires_at IS NOT NULL
           AND finalize_lease_expires_at < now()`,
      );
      assertEquals(rows.rows[0]?.n, 0);
    });
  },
});

Deno.test({
  name: "postgres Batch 228: 25-minute job TTL still aborts unreleased finalize",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, finalize_lease_token, finalize_lease_expires_at,
          publish_rows_inserted, created_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7,
                 $4::uuid, now() + interval '10 minutes', NULL,
                 now() - interval '26 minutes')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const expired = await client.queryObject<{ payload: string }>(
        `SELECT public.expire_screener_sync_stale_jobs_v1(now(), interval '25 minutes')::text AS payload`,
      );
      const payload = JSON.parse(String(expired.rows[0]?.payload ?? "{}"));
      assertEquals(payload.aborted_count, 1);
      const row = await client.queryObject<{ status: string }>(
        `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "aborted");
    });
  },
});

Deno.test({
  name: "postgres Batch 228: published finalize cannot release lease (no duplicate path)",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, finalize_lease_token, finalize_lease_expires_at,
          publish_rows_inserted)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7,
                 $4::uuid, now() - interval '1 minute', 104)`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const res = await client.queryObject<{ payload: string }>(
        `SELECT public.release_screener_sync_finalize_lease_cas_v1(
          $1::uuid, 7, $2::uuid, now()
        )::text AS payload`,
        [jobId, lease],
      );
      assertEquals(JSON.parse(String(res.rows[0]?.payload ?? "{}")).ok, false);
    });
  },
});
