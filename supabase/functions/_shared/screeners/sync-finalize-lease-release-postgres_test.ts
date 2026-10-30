import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isDefinitiveContinueDispatchFailure,
  isUncertainContinueDispatchFailure,
} from "./sync-finalize-lease-release.ts";
import {
  sampleObservation,
  truncateStaging,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

Deno.test("lease release policy: http_500 is uncertain", () => {
  assertEquals(isUncertainContinueDispatchFailure("http_500"), true);
  assertEquals(isDefinitiveContinueDispatchFailure("http_500"), false);
});

Deno.test("lease release policy: structured finalize_failed is definitive", () => {
  assertEquals(
    isDefinitiveContinueDispatchFailure(
      "finalize_failed:atomic_publish:type_error",
    ),
    true,
  );
});

Deno.test({
  name: "postgres CAS: releases only matching finalize lease and state version",
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
                 $4::uuid, now() + interval '12 minutes')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );

      const ok = await client.queryObject<{ payload: string }>(
        `SELECT public.release_screener_sync_finalize_lease_cas_v1(
          $1::uuid, 7, $2::uuid, now()
        )::text AS payload`,
        [jobId, lease],
      );
      assertEquals(JSON.parse(String(ok.rows[0]?.payload ?? "{}")).ok, true);

      const stale = await client.queryObject<{ payload: string }>(
        `SELECT public.release_screener_sync_finalize_lease_cas_v1(
          $1::uuid, 7, $2::uuid, now()
        )::text AS payload`,
        [jobId, lease],
      );
      assertEquals(JSON.parse(String(stale.rows[0]?.payload ?? "{}")).ok, false);
    });
  },
});

Deno.test({
  name: "postgres CAS: rejects stale state version",
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
                 $4::uuid, now() + interval '12 minutes')`,
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
  name: "postgres CAS: published rows block release",
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
                 $4::uuid, now() + interval '12 minutes', 108)`,
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
  name: "postgres CAS: stale finalize token rejected",
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
                 $4::uuid, now() + interval '12 minutes')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const wrongLease = crypto.randomUUID();
      const res = await client.queryObject<{ payload: string }>(
        `SELECT public.release_screener_sync_finalize_lease_cas_v1(
          $1::uuid, 7, $2::uuid, now()
        )::text AS payload`,
        [jobId, wrongLease],
      );
      assertEquals(JSON.parse(String(res.rows[0]?.payload ?? "{}")).ok, false);
    });
  },
});
