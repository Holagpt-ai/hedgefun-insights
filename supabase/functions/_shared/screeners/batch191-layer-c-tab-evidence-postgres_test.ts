/**
 * ISS-024 Layer C — per-generation tab evidence on screener_sync_generation_jobs.
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  layerCSixTabEvidenceEvaluated,
  sampleObservation,
  truncateStaging,
  validScreenerRow,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

Deno.test({
  name: "Layer C: complete rejects finalize without job tab evidence",
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
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1, 1,
                 $4::uuid, now() + interval '12 minutes', 2)`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );
      const complete = await client.queryObject<{ payload: string }>(
        `SELECT public.complete_screener_sync_publish_v1($1, $2, 1, now())::text AS payload`,
        [jobId, lease],
      );
      const parsed = JSON.parse(String(complete.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, false);
      assertEquals(parsed.reason, "publish_complete_rejected");
    });
  },
});

Deno.test({
  name: "Layer C: publish rejects null tab evidence",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      const syncedAt = "2026-11-16T15:00:00.000Z";
      const rows = [validScreenerRow("AAA", "gappers")];
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, merged_artifacts, finalize_lease_token, finalize_lease_expires_at, state_version)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1, '{}'::jsonb,
                 $4::uuid, now() + interval '12 minutes', 0)`,
        [jobId, syncRunId, JSON.stringify({ ...sampleObservation(syncRunId), syncedAt }), lease],
      );
      await assertRejects(async () => {
        await client.queryObject(
          `SELECT public.publish_screener_sync_staged_generation_v1(
            $1::uuid, $2::uuid, 0, $3::jsonb, $4::uuid, $5::timestamptz,
            'initializing', NULL::jsonb, now()
          )`,
          [jobId, lease, JSON.stringify(rows), syncRunId, syncedAt],
        );
      });
    });
  },
});

Deno.test({
  name: "Layer C: aborted job keeps null tab evidence",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version, abort_reason)
         VALUES ($1, $2, 'aborted', $3::jsonb, '[]'::jsonb, 2200, 1, 0, 0,
                 'prior_generation_retained')`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId))],
      );
      const row = await client.queryObject<{
        status: string;
        tab_evaluation_evidence: unknown;
        publish_rows_inserted: number | null;
      }>(
        `SELECT status, tab_evaluation_evidence, publish_rows_inserted
         FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "aborted");
      assertEquals(row.rows[0]?.tab_evaluation_evidence, null);
      assertEquals(row.rows[0]?.publish_rows_inserted, null);
    });
  },
});

Deno.test({
  name: "Layer C: idempotent publish replay keeps stored evidence",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = crypto.randomUUID();
      const syncedAt = "2026-11-16T15:05:00.000Z";
      const rows = [validScreenerRow("AAA", "gappers")];
      const evidence = layerCSixTabEvidenceEvaluated();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, merged_artifacts, finalize_lease_token, finalize_lease_expires_at, state_version)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1, '{}'::jsonb,
                 $4::uuid, now() + interval '12 minutes', 0)`,
        [jobId, syncRunId, JSON.stringify({ ...sampleObservation(syncRunId), syncedAt }), lease],
      );
      const args = [
        jobId,
        lease,
        JSON.stringify(rows),
        syncRunId,
        syncedAt,
        JSON.stringify(evidence),
      ];
      for (let i = 0; i < 2; i++) {
        const pub = await client.queryObject<{ payload: string }>(
          `SELECT public.publish_screener_sync_staged_generation_v1(
            $1::uuid, $2::uuid, 0, $3::jsonb, $4::uuid, $5::timestamptz,
            'initializing', $6::jsonb, now()
          )::text AS payload`,
          args,
        );
        const parsed = JSON.parse(String(pub.rows[0]?.payload ?? "{}"));
        assertEquals(parsed.ok, true);
      }
      const stored = await client.queryObject<{ evidence: unknown }>(
        `SELECT tab_evaluation_evidence AS evidence FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(
        JSON.stringify(stored.rows[0]?.evidence),
        JSON.stringify(evidence),
      );
    });
  },
});