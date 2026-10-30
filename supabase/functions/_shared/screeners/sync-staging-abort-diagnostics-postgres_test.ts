import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  insertChunkingJob,
  pgTestUrl,
  sampleObservation,
  truncateStaging,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

Deno.test({
  name: "postgres: abort_reason and evidence persist with aborted status",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      await insertChunkingJob(client, {
        jobId,
        syncRunId,
        totalChunks: 7,
        nextChunkIndex: 7,
      });
      await client.queryObject(
        `UPDATE public.screener_sync_generation_jobs
         SET status = 'aborted',
             abort_reason = 'prior_generation_retained',
             abort_evidence = $2::jsonb
         WHERE id = $1::uuid AND status IN ('chunking', 'finalizing')`,
        [
          jobId,
          JSON.stringify({
            prior_synced_at: "2026-10-30T17:00:00.000Z",
            candidate_generation_id: jobId,
            candidate_sync_run_id: syncRunId,
            tabs: [],
          }),
        ],
      );
      const row = await client.queryObject<{
        status: string;
        abort_reason: string;
        abort_evidence: Record<string, unknown>;
      }>(
        `SELECT status, abort_reason, abort_evidence
         FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "aborted");
      assertEquals(row.rows[0]?.abort_reason, "prior_generation_retained");
      assertEquals(row.rows[0]?.abort_evidence?.candidate_sync_run_id, syncRunId);
    });
  },
});

Deno.test({
  name: "postgres: abort update does not clobber published jobs",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, publish_rows_inserted)
         VALUES ($1, $2, 'published', $3::jsonb, '[]'::jsonb, 2200, 7, 7, 108)`,
        [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId))],
      );
      await client.queryObject(
        `UPDATE public.screener_sync_generation_jobs
         SET status = 'aborted', abort_reason = 'newer_generation_live'
         WHERE id = $1::uuid AND status IN ('chunking', 'finalizing')`,
        [jobId],
      );
      const row = await client.queryObject<{ status: string; abort_reason: string | null }>(
        `SELECT status, abort_reason FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "published");
      assertEquals(row.rows[0]?.abort_reason, null);
    });
  },
});

Deno.test({
  name: "postgres: abort diagnostics migration columns exist",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    const url = pgTestUrl();
    if (!url) return;
    await withPg(async (client) => {
      const cols = await client.queryObject<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'screener_sync_generation_jobs'
           AND column_name IN ('abort_reason', 'abort_evidence')`,
      );
      assertEquals(cols.rows.length, 2);
    });
  },
});
