/**
 * Mandatory PostgreSQL integration tests (Batch 190 release gate).
 * CI sets SCREENER_SYNC_PG_TEST_URL after bootstrap (Postgres 16 service).
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import {
  insertChunkingJob,
  pgTestUrl,
  sampleObservation,
  sampleTabEvidence,
  truncateStaging,
  validScreenerRow,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

Deno.test("postgres gate: advance RPC has single six-arg signature", async () => {
  await withPg(async (client) => {
    const sigs = await client.queryObject<{ args: number; n: number }>(
      `SELECT pronargs AS args, count(*)::int AS n
       FROM pg_proc WHERE proname = 'advance_screener_sync_chunk_v1'
       GROUP BY pronargs`,
    );
    assertEquals(sigs.rows.length, 1);
    assertEquals(sigs.rows[0]?.args, 6);
    assertEquals(sigs.rows[0]?.n, 1);
  });
});

Deno.test("postgres gate: one active generation (unique index)", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const observation = sampleObservation(crypto.randomUUID());
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
       VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, 1)`,
      [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(observation)],
    );
    let rejected = false;
    try {
      await client.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
         VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1)`,
        [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(observation)],
      );
    } catch {
      rejected = true;
    }
    assertEquals(rejected, true);
  });
});

Deno.test("postgres gate: concurrent active inserts — one wins", async () => {
  const url = pgTestUrl();
  await withPg(async (client) => {
    await truncateStaging(client);
  });
  const observation = sampleObservation(crypto.randomUUID());
  const runInsert = async () => {
    const c = new Client(url);
    await c.connect();
    try {
      await c.queryObject(
        `INSERT INTO public.screener_sync_generation_jobs
         (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
         VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, 1)`,
        [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(observation)],
      );
      return "ok";
    } catch {
      return "rejected";
    } finally {
      await c.end();
    }
  };
  const [a, b] = await Promise.all([runInsert(), runInsert()]);
  const outcomes = [a, b].sort();
  assertEquals(outcomes, ["ok", "rejected"]);
});

Deno.test("postgres gate: seven sequential chunk lease handoffs", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    let lease = crypto.randomUUID();
    await insertChunkingJob(client, {
      jobId,
      syncRunId,
      totalChunks: 7,
      leaseToken: lease,
      nextChunkIndex: 0,
      stateVersion: 0,
    });
    let stateVersion = 0;
    for (let i = 0; i < 7; i++) {
      const adv = await client.queryObject<{ payload: string }>(
        `SELECT public.advance_screener_sync_chunk_v1(
          $1::uuid, $2::uuid, $3, $4, '{}'::jsonb, now()
        )::text AS payload`,
        [jobId, lease, i, stateVersion],
      );
      const parsed = JSON.parse(String(adv.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, true, `chunk ${i}`);
      stateVersion += 1;
      const leaseRow = await client.queryObject<{ lease_token: string | null; status: string; next: number }>(
        `SELECT lease_token, status, next_chunk_index AS next
         FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(leaseRow.rows[0]?.lease_token, null);
      if (i < 6) {
        assertEquals(leaseRow.rows[0]?.status, "chunking");
        lease = crypto.randomUUID();
        const claim = await client.queryObject<{ payload: string }>(
          `SELECT public.claim_screener_sync_lease_v1(
            $1::uuid, $2::uuid, now(), now() + interval '12 minutes', 'chunk'
          )::text AS payload`,
          [jobId, lease],
        );
        const claimParsed = JSON.parse(String(claim.rows[0]?.payload ?? "{}"));
        assertEquals(claimParsed.ok, true);
      } else {
        assertEquals(leaseRow.rows[0]?.status, "finalizing");
      }
    }
  });
});

Deno.test("postgres gate: CAS rejects stale chunk advance", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const lease = crypto.randomUUID();
    await insertChunkingJob(client, {
      jobId,
      syncRunId,
      totalChunks: 3,
      leaseToken: lease,
    });
    const adv = await client.queryObject<{ payload: string }>(
      `SELECT public.advance_screener_sync_chunk_v1(
        $1::uuid, $2::uuid, 99, 0, '{}'::jsonb, now()
      )::text AS payload`,
      [jobId, lease],
    );
    const parsed = JSON.parse(String(adv.rows[0]?.payload ?? "{}"));
    assertEquals(parsed.ok, false);
    assertEquals(parsed.reason, "chunk_advance_rejected");
  });
});

Deno.test("postgres gate: expire finalizing releases slot; publish record preserved", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const stranded = crypto.randomUUID();
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, created_at, finalize_lease_token, finalize_lease_expires_at)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
               now() - interval '30 minutes', $4::uuid, now() - interval '1 minute')`,
      [stranded, crypto.randomUUID(), JSON.stringify(sampleObservation(crypto.randomUUID())), crypto.randomUUID()],
    );
    const expired = await client.queryObject<{ payload: string }>(
      `SELECT public.expire_screener_sync_stale_jobs_v1(now(), interval '25 minutes')::text AS payload`,
    );
    const payload = JSON.parse(String(expired.rows[0]?.payload ?? "{}"));
    assertEquals(payload.ok, true);
    assertEquals(payload.aborted_count, 1);
    const strandedRow = await client.queryObject<{ status: string }>(
      `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [stranded],
    );
    assertEquals(strandedRow.rows[0]?.status, "aborted");

    const preserved = crypto.randomUUID();
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, created_at, publish_rows_inserted, publish_rpc_recorded_at)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
               now() - interval '30 minutes', 2, now() - interval '29 minutes')`,
      [preserved, crypto.randomUUID(), JSON.stringify(sampleObservation(crypto.randomUUID()))],
    );
    await client.queryObject(
      `SELECT public.expire_screener_sync_stale_jobs_v1(now(), interval '25 minutes')`,
    );
    const preservedRow = await client.queryObject<{ status: string }>(
      `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [preserved],
    );
    assertEquals(preservedRow.rows[0]?.status, "finalizing");

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
    assertEquals(blocked, true);

    await client.queryObject(
      `DELETE FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [preserved],
    );
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks)
       VALUES ($1, $2, 'chunking', $3::jsonb, '[]'::jsonb, 2200, 1)`,
      [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(sampleObservation(crypto.randomUUID()))],
    );
  });
});

Deno.test("postgres gate: atomic publish + complete + feed evidence", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const finalizeLease = crypto.randomUUID();
    const syncedAt = "2026-10-28T18:00:00.000Z";
    const rows = [
      validScreenerRow("AAA", "gappers"),
      validScreenerRow("BBB", "gappers"),
    ];
    const evidence = sampleTabEvidence();
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, merged_artifacts, finalize_lease_token, finalize_lease_expires_at, state_version)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1, '{}'::jsonb,
               $4::uuid, now() + interval '12 minutes', 0)`,
      [
        jobId,
        syncRunId,
        JSON.stringify({ ...sampleObservation(syncRunId), syncedAt }),
        finalizeLease,
      ],
    );
    const pub = await client.queryObject<{ payload: string }>(
      `SELECT public.publish_screener_sync_staged_generation_v1(
        $1::uuid, $2::uuid, 0, $3::jsonb, $4::uuid, $5::timestamptz,
        'initializing', $6::jsonb, now()
      )::text AS payload`,
      [jobId, finalizeLease, JSON.stringify(rows), syncRunId, syncedAt, JSON.stringify(evidence)],
    );
    const pubParsed = JSON.parse(String(pub.rows[0]?.payload ?? "{}"));
    assertEquals(pubParsed.ok, true);
    assertEquals(pubParsed.rows_inserted, 2);
    const jobAfter = await client.queryObject<{ publish_rows_inserted: number | null; state_version: number }>(
      `SELECT publish_rows_inserted, state_version FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [jobId],
    );
    assertEquals(jobAfter.rows[0]?.publish_rows_inserted, 2);
    const feed = await client.queryObject<{ sync_run_id: string; rows_inserted: number; evidence: unknown }>(
      `SELECT sync_run_id, rows_inserted, tab_evaluation_evidence AS evidence
       FROM public.screener_feed_state WHERE state_key = 'current'`,
    );
    assertEquals(feed.rows[0]?.sync_run_id, syncRunId);
    assertEquals(feed.rows[0]?.rows_inserted, 2);
    const complete = await client.queryObject<{ payload: string }>(
      `SELECT public.complete_screener_sync_publish_v1(
        $1::uuid, $2::uuid, $3, now()
      )::text AS payload`,
      [jobId, finalizeLease, jobAfter.rows[0]?.state_version],
    );
    const completeParsed = JSON.parse(String(complete.rows[0]?.payload ?? "{}"));
    assertEquals(completeParsed.ok, true);
    const published = await client.queryObject<{ status: string }>(
      `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [jobId],
    );
    assertEquals(published.rows[0]?.status, "published");
  });
});

Deno.test("postgres gate: duplicate atomic publish is idempotent", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const finalizeLease = crypto.randomUUID();
    const syncedAt = "2026-10-28T18:05:00.000Z";
    const rows = [validScreenerRow("ZZZ", "gappers")];
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, finalize_lease_token, finalize_lease_expires_at, state_version)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
               $4::uuid, now() + interval '12 minutes', 0)`,
      [jobId, syncRunId, JSON.stringify({ ...sampleObservation(syncRunId), syncedAt }), finalizeLease],
    );
    const args = [jobId, finalizeLease, JSON.stringify(rows), syncRunId, syncedAt];
    for (let i = 0; i < 2; i++) {
      const pub = await client.queryObject<{ payload: string }>(
        `SELECT public.publish_screener_sync_staged_generation_v1(
          $1::uuid, $2::uuid, 0, $3::jsonb, $4::uuid, $5::timestamptz,
          'initializing', '{}'::jsonb, now()
        )::text AS payload`,
        args,
      );
      const parsed = JSON.parse(String(pub.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, true);
      assertEquals(parsed.rows_inserted, 1);
    }
    const count = await client.queryObject<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.screener_results WHERE sync_run_id = $1`,
      [syncRunId],
    );
    assertEquals(count.rows[0]?.n, 1);
  });
});

Deno.test("postgres gate: replace failure rolls back publish record", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const finalizeLease = crypto.randomUUID();
    const badRows = [{ tab_id: "day_trade_radar", symbol: "BAD" }];
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, finalize_lease_token, finalize_lease_expires_at, state_version)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
               $4::uuid, now() + interval '12 minutes', 0)`,
      [jobId, syncRunId, JSON.stringify(sampleObservation(syncRunId)), finalizeLease],
    );
    await assertRejects(async () => {
      await client.queryObject(
        `SELECT public.publish_screener_sync_staged_generation_v1(
          $1::uuid, $2::uuid, 0, $3::jsonb, $4::uuid, now(), 'initializing', '{}'::jsonb, now()
        )`,
        [jobId, finalizeLease, JSON.stringify(badRows), syncRunId],
      );
    });
    const job = await client.queryObject<{ publish_rows_inserted: number | null }>(
      `SELECT publish_rows_inserted FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [jobId],
    );
    assertEquals(job.rows[0]?.publish_rows_inserted, null);
  });
});

Deno.test("postgres gate: rejects older generation when newer feed live", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const newerRun = crypto.randomUUID();
    const olderRun = crypto.randomUUID();
    await client.queryObject(
      `INSERT INTO public.screener_feed_state (
         state_key, sync_run_id, status, synced_at, rows_inserted, tab_counts, updated_at
       ) VALUES (
         'current', $1, 'available', '2026-10-28T19:00:00.000Z', 1,
         '{"day_trade_radar":1}'::jsonb, '2026-10-28T19:00:00.000Z'
       )`,
      [newerRun],
    );
    const jobId = crypto.randomUUID();
    const finalizeLease = crypto.randomUUID();
    const rows = [validScreenerRow("OLD", "gappers")];
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, finalize_lease_token, finalize_lease_expires_at, state_version)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
               $4::uuid, now() + interval '12 minutes', 0)`,
      [
        jobId,
        olderRun,
        JSON.stringify(sampleObservation(olderRun)),
        finalizeLease,
      ],
    );
    const pub = await client.queryObject<{ payload: string }>(
      `SELECT public.publish_screener_sync_staged_generation_v1(
        $1::uuid, $2::uuid, 0, $3::jsonb, $4::uuid, '2026-10-28T18:00:00.000Z'::timestamptz,
        'initializing', '{}'::jsonb, now()
      )::text AS payload`,
      [jobId, finalizeLease, JSON.stringify(rows), olderRun],
    );
    const parsed = JSON.parse(String(pub.rows[0]?.payload ?? "{}"));
    assertEquals(parsed.ok, false);
    assertEquals(parsed.reason, "newer_generation_live");
  });
});

Deno.test("postgres gate: recovery after publish before complete", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const finalizeLease = crypto.randomUUID();
    const syncedAt = "2026-10-28T18:10:00.000Z";
    const rows = [validScreenerRow("REC", "gappers")];
    await client.queryObject(
      `INSERT INTO public.screener_sync_generation_jobs
       (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
        next_chunk_index, finalize_lease_token, finalize_lease_expires_at, state_version)
       VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 1, 1,
               $4::uuid, now() + interval '12 minutes', 0)`,
      [jobId, syncRunId, JSON.stringify({ ...sampleObservation(syncRunId), syncedAt }), finalizeLease],
    );
    const pub = await client.queryObject<{ payload: string }>(
      `SELECT public.publish_screener_sync_staged_generation_v1(
        $1::uuid, $2::uuid, 0, $3::jsonb, $4::uuid, $5::timestamptz,
        'initializing', '{}'::jsonb, now()
      )::text AS payload`,
      [jobId, finalizeLease, JSON.stringify(rows), syncRunId, syncedAt],
    );
    assertEquals(JSON.parse(String(pub.rows[0]?.payload ?? "{}")).ok, true);
    const mid = await client.queryObject<{ state_version: number }>(
      `SELECT state_version FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [jobId],
    );
    const complete = await client.queryObject<{ payload: string }>(
      `SELECT public.complete_screener_sync_publish_v1(
        $1::uuid, $2::uuid, $3, now()
      )::text AS payload`,
      [jobId, finalizeLease, mid.rows[0]?.state_version],
    );
    assertEquals(JSON.parse(String(complete.rows[0]?.payload ?? "{}")).ok, true);
    const status = await client.queryObject<{ status: string }>(
      `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
      [jobId],
    );
    assertEquals(status.rows[0]?.status, "published");
  });
});
