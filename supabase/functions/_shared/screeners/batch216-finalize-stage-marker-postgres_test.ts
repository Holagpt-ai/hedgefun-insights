import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatFinalizeStageMarker } from "./sync-finalize-diagnostics.ts";
import {
  sampleObservation,
  truncateStaging,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

/**
 * Mirrors the PostgREST filter used by noteFinalizeStage:
 * status IN (chunking, finalizing) AND
 * (continue_last_error IS NULL OR continue_last_error LIKE 'finalize_stage:%')
 */
async function conditionalMarkerUpdate(
  client: {
    queryObject: (
      query: string,
      args?: unknown[],
    ) => Promise<{ rowCount?: number | null }>;
  },
  input: { jobId: string; marker: string; nowIso: string },
): Promise<number> {
  const res = await client.queryObject(
    `UPDATE public.screener_sync_generation_jobs
     SET continue_last_error = $2,
         updated_at = $3::timestamptz
     WHERE id = $1::uuid
       AND status IN ('chunking', 'finalizing')
       AND (
         continue_last_error IS NULL
         OR continue_last_error LIKE 'finalize_stage:%'
       )`,
    [input.jobId, input.marker, input.nowIso],
  );
  return res.rowCount ?? 0;
}

Deno.test({
  name: "postgres: conditional marker write progresses and never replaces real errors",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, state_version)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7)`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId))],
      );

      const first = formatFinalizeStageMarker("claim_finalize_lease");
      assertEquals(
        await conditionalMarkerUpdate(client, {
          jobId,
          marker: first,
          nowIso: new Date().toISOString(),
        }),
        1,
      );

      const second = formatFinalizeStageMarker("atomic_publish");
      assertEquals(
        await conditionalMarkerUpdate(client, {
          jobId,
          marker: second,
          nowIso: new Date().toISOString(),
        }),
        1,
      );

      const afterProgress = await client.queryObject<{ continue_last_error: string | null }>(
        `SELECT continue_last_error FROM public.screener_sync_generation_jobs WHERE id = $1::uuid`,
        [jobId],
      );
      assertEquals(afterProgress.rows[0]?.continue_last_error, second);

      await client.queryObject(
        `UPDATE public.screener_sync_generation_jobs
         SET continue_last_error = 'finalize_failed:build_rows:type_error'
         WHERE id = $1::uuid`,
        [jobId],
      );
      assertEquals(
        await conditionalMarkerUpdate(client, {
          jobId,
          marker: formatFinalizeStageMarker("build_evidence"),
          nowIso: new Date().toISOString(),
        }),
        0,
      );

      await client.queryObject(
        `UPDATE public.screener_sync_generation_jobs
         SET continue_last_error = 'http_546:finalize_stage:atomic_publish'
         WHERE id = $1::uuid`,
        [jobId],
      );
      assertEquals(
        await conditionalMarkerUpdate(client, {
          jobId,
          marker: formatFinalizeStageMarker("complete_publish"),
          nowIso: new Date().toISOString(),
        }),
        0,
      );

      const final = await client.queryObject<{ continue_last_error: string | null }>(
        `SELECT continue_last_error FROM public.screener_sync_generation_jobs WHERE id = $1::uuid`,
        [jobId],
      );
      assertEquals(
        final.rows[0]?.continue_last_error,
        "http_546:finalize_stage:atomic_publish",
      );
    });
  },
});

Deno.test({
  name: "postgres: complete_screener_sync_publish_v1 clears continue_last_error",
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
          continue_last_error, publish_rows_inserted)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 7,
                 $4::uuid, now() + interval '12 minutes',
                 'finalize_stage:atomic_publish', 6)`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), lease],
      );

      const complete = await client.queryObject<{ payload: string }>(
        `SELECT public.complete_screener_sync_publish_v1(
          $1::uuid, $2::uuid, 7, now()
        )::text AS payload`,
        [jobId, lease],
      );
      assertEquals(JSON.parse(String(complete.rows[0]?.payload ?? "{}")).ok, true);

      const row = await client.queryObject<{
        status: string;
        continue_last_error: string | null;
      }>(
        `SELECT status, continue_last_error
         FROM public.screener_sync_generation_jobs WHERE id = $1::uuid`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "published");
      assertEquals(row.rows[0]?.continue_last_error, null);
    });
  },
});
