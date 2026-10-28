/**
 * Real PostgreSQL integration tests (Batch 190.2–190.3).
 *
 * Disposable DB only:
 *   docker run -d --rm --name stocksist-pg-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:16-alpine
 *   set SCREENER_SYNC_PG_TEST_URL=postgresql://postgres:test@127.0.0.1:5433/postgres
 *   node scripts/supabase/screener-sync-pg-test-setup.mjs
 *
 * GitHub Actions does not provision Postgres; tests skip when URL is unset.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

function pgTestUrl(): string {
  return Deno.env.get("SCREENER_SYNC_PG_TEST_URL") ?? "";
}

function pgIntegrationEnabled(): boolean {
  const url = pgTestUrl();
  if (!url) return false;
  if (/lovable|supabase\.co|zcjptaolpumhtlwhlemq/i.test(url)) {
    throw new Error("Refusing Postgres integration tests against production-like host");
  }
  return true;
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

async function rpcExists(client: Client, name: string): Promise<boolean> {
  const res = await client.queryObject<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = $1) AS exists`,
    [name],
  );
  return res.rows[0]?.exists === true;
}

const obs = () => ({
  nowMs: 1,
  sessionKind: "regular",
  extendedSession: false,
  observationSessionFields: true,
  syncedAt: new Date().toISOString(),
  syncRunId: crypto.randomUUID(),
});

Deno.test({
  name: "postgres: only one active chunking/finalizing row (unique index)",
  ignore: !pgIntegrationEnabled(),
  fn: async () => {
    await withPg(async (client) => {
      if (!(await tableExists(client))) {
        throw new Error("staging table missing — apply migrations first");
      }
      await client.queryObject(`DELETE FROM public.screener_sync_generation_jobs`);
      const observation = obs();
      const tickers = [{ ticker: "AAA", day: { v: 1, c: 1 } }];
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
         VALUES ($1, $2, 'chunking', $3::jsonb, $4::jsonb, 2200, 1)`,
        [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(observation), JSON.stringify(tickers)],
      );
      let rejected = false;
      try {
        await client.queryObject(
          `INSERT INTO public.screener_sync_generation_jobs
           (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
           VALUES ($1, $2, 'finalizing', $3::jsonb, $4::jsonb, 2200, 1)`,
          [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(observation), JSON.stringify(tickers)],
        );
      } catch {
        rejected = true;
      }
      assertEquals(rejected, true);
    });
  },
});

Deno.test({
  name: "postgres: advance_screener_sync_chunk_v1 releases lease (six-arg only)",
  ignore: !pgIntegrationEnabled(),
  fn: async () => {
    await withPg(async (client) => {
      if (!(await rpcExists(client, "advance_screener_sync_chunk_v1"))) {
        throw new Error("advance RPC missing — apply migrations through 20261028230000");
      }
      const sigs = await client.queryObject<{ args: number }>(
        `SELECT pronargs AS args FROM pg_proc WHERE proname = 'advance_screener_sync_chunk_v1'`,
      );
      assertEquals(sigs.rows.length, 1);
      assertEquals(sigs.rows[0]?.args, 6);

      await client.queryObject(`DELETE FROM public.screener_sync_generation_jobs`);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const lease = "11111111-1111-1111-1111-111111111111";
      const observation = { ...obs(), syncRunId };
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, next_chunk_index,
          total_chunks, merged_artifacts, lease_token, lease_expires_at, state_version)
         VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, 0, 1, '{}'::jsonb,
                 $4::uuid, now() + interval '5 minutes', 0)`,
        [jobId, syncRunId, JSON.stringify(observation), lease],
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
  name: "postgres: expire_screener_sync_stale_jobs_v1 releases active slot",
  ignore: !pgIntegrationEnabled(),
  fn: async () => {
    await withPg(async (client) => {
      if (!(await rpcExists(client, "expire_screener_sync_stale_jobs_v1"))) {
        throw new Error("expire RPC missing — apply 20261028230000");
      }
      await client.queryObject(`DELETE FROM public.screener_sync_generation_jobs`);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, created_at, finalize_lease_token, finalize_lease_expires_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
                 now() - interval '30 minutes', $4::uuid, now() - interval '1 minute')`,
        [jobId, syncRunId, JSON.stringify(obs()), crypto.randomUUID()],
      );
      const expired = await client.queryObject<{ expire_screener_sync_stale_jobs_v1: string }>(
        `SELECT public.expire_screener_sync_stale_jobs_v1(now(), interval '25 minutes')
         AS expire_screener_sync_stale_jobs_v1`,
      );
      const payload = JSON.parse(
        String(expired.rows[0]?.expire_screener_sync_stale_jobs_v1 ?? "{}"),
      );
      assertEquals(payload.ok, true);
      assertEquals(payload.aborted_count >= 1, true);
      const row = await client.queryObject<{ status: string }>(
        `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "aborted");

      const observation = obs();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
         VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, 1)`,
        [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(observation)],
      );
    });
  },
});

Deno.test({
  name: "postgres: expire does not abort finalizing with publish_rows_inserted set",
  ignore: !pgIntegrationEnabled(),
  fn: async () => {
    await withPg(async (client) => {
      await client.queryObject(`DELETE FROM public.screener_sync_generation_jobs`);
      const jobId = crypto.randomUUID();
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
          next_chunk_index, created_at, publish_rows_inserted, publish_rpc_recorded_at)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
                 now() - interval '30 minutes', 40, now() - interval '29 minutes')`,
        [jobId, crypto.randomUUID(), JSON.stringify(obs())],
      );
      await client.queryObject(
        `SELECT public.expire_screener_sync_stale_jobs_v1(now(), interval '25 minutes')`,
      );
      const row = await client.queryObject<{ status: string }>(
        `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(row.rows[0]?.status, "finalizing");
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
