/**
 * Real PostgreSQL integration tests (Batch 190.2).
 *
 * Set SCREENER_SYNC_PG_TEST_URL=postgresql://user:pass@host:5432/dbname
 * with migrations 20261028200000 → 20261028220000 applied.
 *
 * GitHub Actions does not provision Postgres; tests skip when URL is unset.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

function pgTestUrl(): string {
  return Deno.env.get("SCREENER_SYNC_PG_TEST_URL") ?? "";
}

function pgIntegrationEnabled(): boolean {
  return pgTestUrl().length > 0;
}

async function withPg(fn: (c: Client) => Promise<void>): Promise<void> {
  const client = new Client(pgTestUrl());
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

async function tableExists(client: Client): Promise<boolean> {
  const res = await client.queryObject<{ reg: boolean }>(
    `SELECT to_regclass('public.screener_sync_generation_jobs') IS NOT NULL AS reg`,
  );
  return res.rows[0]?.reg === true;
}

Deno.test({
  name: "postgres: only one active chunking/finalizing row (unique index)",
  ignore: !pgIntegrationEnabled(),
  fn: async () => {
    await withPg(async (client) => {
      if (!(await tableExists(client))) {
        throw new Error("staging table missing — apply migrations first");
      }
      await client.queryObject(`DELETE FROM public.screener_sync_generation_jobs`);
      const obs = {
        nowMs: 1,
        sessionKind: "regular",
        extendedSession: false,
        observationSessionFields: true,
        syncedAt: new Date().toISOString(),
        syncRunId: crypto.randomUUID(),
      };
      const tickers = [{ ticker: "AAA", day: { v: 1, c: 1 } }];
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
         VALUES ($1, $2, 'chunking', $3::jsonb, $4::jsonb, 2200, 1)`,
        [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(obs), JSON.stringify(tickers)],
      );
      let rejected = false;
      try {
        await client.queryObject(
          `INSERT INTO public.screener_sync_generation_jobs
           (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
           VALUES ($1, $2, 'finalizing', $3::jsonb, $4::jsonb, 2200, 1)`,
          [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(obs), JSON.stringify(tickers)],
        );
      } catch {
        rejected = true;
      }
      assertEquals(rejected, true);
    });
  },
});

Deno.test({
  name: "postgres: advance_screener_sync_chunk_v1 releases lease",
  ignore: !pgIntegrationEnabled(),
  fn: async () => {
    await withPg(async (client) => {
      const res = await client.queryObject<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM pg_proc WHERE proname = 'advance_screener_sync_chunk_v1'
        ) AS exists`,
      );
      if (!res.rows[0]?.exists) {
        throw new Error("advance RPC missing — apply 20261028220000");
      }
      await client.queryObject(`DELETE FROM public.screener_sync_generation_jobs`);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = "11111111-1111-1111-1111-111111111111";
      const obs = {
        nowMs: 1,
        sessionKind: "regular",
        extendedSession: false,
        observationSessionFields: true,
        syncedAt: new Date().toISOString(),
        syncRunId,
      };
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, next_chunk_index,
          total_chunks, merged_artifacts, lease_token, lease_expires_at, state_version)
         VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, 0, 1, '{}'::jsonb,
                 $4::uuid, now() + interval '5 minutes', 0)`,
        [jobId, syncRunId, JSON.stringify(obs), lease],
      );
      const adv = await client.queryObject<{ advance_screener_sync_chunk_v1: string }>(
        `SELECT public.advance_screener_sync_chunk_v1(
          $1::uuid, $2::uuid, 0, 0, '{}'::jsonb, now()
        ) AS advance_screener_sync_chunk_v1`,
        [jobId, lease],
      );
      const payload = JSON.parse(
        String(adv.rows[0]?.advance_screener_sync_chunk_v1 ?? "{}"),
      );
      assertEquals(payload.ok, true);
      const row = await client.queryObject<{ lease_token: string | null }>(
        `SELECT lease_token FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.lease_token, null);
    });
  },
});

Deno.test({
  name: "postgres integration skipped — set SCREENER_SYNC_PG_TEST_URL to enable",
  ignore: pgIntegrationEnabled(),
  fn: () => {
    assertEquals(true, true);
  },
});
