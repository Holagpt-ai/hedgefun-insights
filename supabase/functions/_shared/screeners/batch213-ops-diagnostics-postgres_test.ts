/**
 * Batch 213 Postgres integration — get_ops_scanner_diagnostics_v1.
 *
 * Security (ACL, SECURITY DEFINER config, anon / no-JWT / non-admin
 * rejection), boundaries (job limit clamp, calendar window), redaction, and
 * read-only behavior. Disposable database only (see
 * scripts/supabase/screener-sync-pg-test-setup.mjs).
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { hasExecute, publicHasExecute } from "./sync-staging-postgres-acl-helpers.ts";
import { truncateStaging, withPg } from "./sync-staging-postgres-helpers.ts";

const RPC = "get_ops_scanner_diagnostics_v1(integer)";
const REDACT = "ops_diagnostics_redact_v1(text,integer)";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const MODERATOR = "00000000-0000-4000-8000-0000000000c3";

const ALLOWED_JOB_KEYS = [
  "abort_prior_synced_at",
  "abort_reason",
  "abort_tabs",
  "continue_last_at",
  "continue_last_error",
  "created_at",
  "finalize_lease_expires_at",
  "id",
  "lease_expires_at",
  "next_chunk_index",
  "publish_rows_inserted",
  "publish_rpc_recorded_at",
  "status",
  "sync_run_id",
  "total_chunks",
  "updated_at",
].sort();

type CallResult = { ok: true; body: Record<string, unknown> } | { ok: false; code: string | undefined };

async function callAs(
  client: Client,
  role: "anon" | "authenticated" | "service_role",
  sub: string | null,
  limit: number | null = 10,
): Promise<CallResult> {
  await client.queryObject("BEGIN");
  try {
    await client.queryObject(`SET LOCAL ROLE ${role}`);
    await client.queryObject(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub ?? ""]);
    const r = await client.queryObject<{ d: Record<string, unknown> }>(
      `SELECT public.get_ops_scanner_diagnostics_v1($1::integer) AS d`,
      [limit],
    );
    return { ok: true, body: r.rows[0].d };
  } catch (err) {
    const code = (err as { fields?: { code?: string } }).fields?.code;
    return { ok: false, code };
  } finally {
    await client.queryObject("ROLLBACK");
  }
}

async function seedRoles(client: Client) {
  await client.queryObject(`DELETE FROM public.user_roles`);
  await client.queryObject(
    `INSERT INTO public.user_roles (user_id, role) VALUES
       ($1, 'admin'), ($2, 'user'), ($3, 'moderator')`,
    [ADMIN, MEMBER, MODERATOR],
  );
}

async function insertJob(
  client: Client,
  opts: {
    status: string;
    createdAt: string;
    nextChunk?: number;
    finalizeLeaseExpiresAt?: string | null;
    continueLastError?: string | null;
    abortReason?: string | null;
    abortEvidence?: unknown;
    publishRows?: number | null;
  },
): Promise<string> {
  const r = await client.queryObject<{ id: string }>(
    `INSERT INTO public.screener_sync_generation_jobs (
       sync_run_id, status, observation, all_tickers, gainers, losers, chunk_size,
       next_chunk_index, total_chunks, merged_artifacts, lease_token, finalize_lease_token,
       finalize_lease_expires_at, continue_last_error, abort_reason, abort_evidence,
       publish_rows_inserted, publish_rpc_recorded_at, nhl_baseline_snapshot, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, '{"secretObservation":"OBS_SENTINEL"}'::jsonb,
       '["TICKER_SENTINEL_AAA","TICKER_SENTINEL_BBB"]'::jsonb, '["GAINER_SENTINEL"]'::jsonb, '[]'::jsonb, 2200,
       $2, 7, '{"artifact":"MERGED_SENTINEL"}'::jsonb, gen_random_uuid(), gen_random_uuid(),
       $3::timestamptz, $4, $5, $6::jsonb,
       $7, CASE WHEN $7::integer IS NULL THEN NULL ELSE $8::timestamptz END,
       '{"nhl":"NHL_SENTINEL"}'::jsonb, $8::timestamptz, $8::timestamptz
     ) RETURNING id`,
    [
      opts.status,
      opts.nextChunk ?? 7,
      opts.finalizeLeaseExpiresAt ?? null,
      opts.continueLastError ?? null,
      opts.abortReason ?? null,
      opts.abortEvidence === undefined ? null : JSON.stringify(opts.abortEvidence),
      opts.publishRows ?? null,
      opts.createdAt,
    ],
  );
  return r.rows[0].id;
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

Deno.test("Batch 213 ACL: only authenticated may EXECUTE; helper is private", async () => {
  await withPg(async (client) => {
    assertEquals(await hasExecute(client, "authenticated", RPC), true);
    assertEquals(await hasExecute(client, "anon", RPC), false);
    assertEquals(await hasExecute(client, "service_role", RPC), false);
    assertEquals(await publicHasExecute(client, RPC), false);
    for (const role of ["anon", "authenticated", "service_role"]) {
      assertEquals(await hasExecute(client, role, REDACT), false, `${role} must not execute redact helper`);
    }
    assertEquals(await publicHasExecute(client, REDACT), false);
  });
});

Deno.test("Batch 213 function config: SECURITY DEFINER, empty search_path, STABLE, no writes in body", async () => {
  await withPg(async (client) => {
    const r = await client.queryObject<{ prosecdef: boolean; proconfig: string[] | null; provolatile: string; src: string }>(
      `SELECT p.prosecdef, p.proconfig, p.provolatile, p.prosrc AS src
       FROM pg_proc p WHERE p.oid = $1::regprocedure`,
      [RPC],
    );
    const row = r.rows[0];
    assertEquals(row.prosecdef, true);
    assert(row.proconfig?.some((c) => c === 'search_path=""' || c === "search_path="), `proconfig ${row.proconfig}`);
    assertEquals(row.provolatile, "s");
    assert(!/\b(insert|update|delete|truncate|alter|drop|grant|perform)\b/i.test(row.src), "body must be read-only");
  });
});

Deno.test("Batch 213 rejects anon, missing JWT, member and moderator", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    await seedRoles(client);
    const anon = await callAs(client, "anon", ADMIN);
    assertEquals(anon.ok, false);
    assertEquals(anon.ok === false && anon.code, "42501");
    for (const sub of [null, MEMBER, MODERATOR, "00000000-0000-4000-8000-00000000dead"]) {
      const res = await callAs(client, "authenticated", sub);
      assertEquals(res.ok, false, `sub=${sub} must be rejected`);
      assertEquals(res.ok === false && res.code, "42501");
    }
    const svc = await callAs(client, "service_role", ADMIN);
    assertEquals(svc.ok, false, "service_role has no EXECUTE");
  });
});

Deno.test("Batch 213 table grants unchanged: authenticated still cannot read jobs or calendar directly", async () => {
  await withPg(async (client) => {
    for (const table of ["screener_sync_generation_jobs", "market_session_calendar"]) {
      const r = await client.queryObject<{ ok: boolean }>(
        `SELECT has_table_privilege('authenticated', $1, 'SELECT') AS ok`,
        [`public.${table}`],
      );
      assertEquals(r.rows[0].ok, false, table);
    }
  });
});

Deno.test("Batch 213 admin: whitelisted, redacted, bounded job records", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    await seedRoles(client);
    await insertJob(client, {
      status: "failed",
      createdAt: minutesAgo(5),
      continueLastError:
        "finalize http_546 Authorization: Bearer abcdefghijklmnopqrstu https://api.polygon.io/x?apiKey=POLYKEYSECRET123 " +
        "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop " + "x".repeat(600),
    });
    await insertJob(client, {
      status: "aborted",
      createdAt: minutesAgo(10),
      abortReason: "prior_generation_retained",
      abortEvidence: {
        prior_synced_at: "2026-11-06T14:00:00.000Z",
        candidate_generation_id: "CANDIDATE_SENTINEL",
        candidate_sync_run_id: "CANDIDATE_RUN_SENTINEL",
        tabs: [
          { tab: "gappers", prior_status: "evaluated", candidate_status: "prerequisite_unavailable", triggered_preservation: true },
          { tab: "gainers_losers", prior_status: "evaluated", candidate_status: "evaluated", triggered_preservation: false },
        ],
      },
    });
    await insertJob(client, { status: "published", createdAt: minutesAgo(15), publishRows: 85 });

    const res = await callAs(client, "authenticated", ADMIN, 10);
    assert(res.ok, "admin call must succeed");
    const body = (res as { body: Record<string, unknown> }).body;
    const text = JSON.stringify(body);
    for (const sentinel of [
      "TICKER_SENTINEL",
      "GAINER_SENTINEL",
      "MERGED_SENTINEL",
      "NHL_SENTINEL",
      "OBS_SENTINEL",
      "CANDIDATE_SENTINEL",
      "CANDIDATE_RUN_SENTINEL",
      "POLYKEYSECRET123",
      "abcdefghijklmnopqrstu",
      "eyJhbGciOiJIUzI1NiJ9",
      "lease_token",
      "state_version",
    ]) {
      assert(!text.includes(sentinel), `response leaked ${sentinel}`);
    }

    const jobs = body.jobs as Array<Record<string, unknown>>;
    assertEquals(jobs.length, 3);
    for (const j of jobs) assertEquals(Object.keys(j).sort(), ALLOWED_JOB_KEYS);
    assertEquals(jobs.map((j) => j.status), ["failed", "aborted", "published"], "newest first");

    const err = jobs[0].continue_last_error as string;
    assert(err.includes("http_546"), "classification signal survives redaction");
    assert(err.includes("[redacted]"));
    assert(err.length <= 300, `bounded error length ${err.length}`);

    const tabs = jobs[1].abort_tabs as Array<Record<string, unknown>>;
    assertEquals(tabs[0], {
      tab: "gappers",
      prior_status: "evaluated",
      candidate_status: "prerequisite_unavailable",
      triggered_preservation: true,
    });
    assertEquals(jobs[1].abort_prior_synced_at, "2026-11-06T14:00:00.000Z");
    assertEquals(jobs[2].publish_rows_inserted, 85);
    assertEquals(body.schema_version, 1);
  });
});

Deno.test("Batch 213 job limit is clamped to 1..20 and stranded count covers older jobs", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    await seedRoles(client);
    for (let i = 0; i < 24; i++) {
      await insertJob(client, { status: "published", createdAt: minutesAgo(i + 1), publishRows: 10 });
    }
    await insertJob(client, {
      status: "finalizing",
      createdAt: minutesAgo(600),
      finalizeLeaseExpiresAt: minutesAgo(590),
    });

    const big = await callAs(client, "authenticated", ADMIN, 1000);
    assert(big.ok);
    const bigBody = (big as { body: Record<string, unknown> }).body;
    assertEquals((bigBody.jobs as unknown[]).length, 20);
    assertEquals(bigBody.job_limit, 20);
    assertEquals(bigBody.stranded_finalizing_count, 1, "stranded job outside window still counted");

    const zero = await callAs(client, "authenticated", ADMIN, 0);
    assertEquals(((zero as { body: Record<string, unknown> }).body.jobs as unknown[]).length, 1);
    const neg = await callAs(client, "authenticated", ADMIN, -5);
    assertEquals(((neg as { body: Record<string, unknown> }).body.jobs as unknown[]).length, 1);
    const nul = await callAs(client, "authenticated", ADMIN, null);
    assertEquals(((nul as { body: Record<string, unknown> }).body.jobs as unknown[]).length, 10);
  });
});

Deno.test("Batch 213 calendar: only exception rows near today, with coverage metadata", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    await seedRoles(client);
    await client.queryObject(`DELETE FROM public.market_session_calendar`);

    const empty = await callAs(client, "authenticated", ADMIN);
    const emptyCal = (empty as { body: Record<string, unknown> }).body.calendar as Record<string, unknown>;
    assertEquals(emptyCal.loaded, false);
    assertEquals(emptyCal.exceptions, []);

    await client.queryObject(
      `INSERT INTO public.market_session_calendar
         (session_date, market_status, regular_open_et, regular_close_et, after_hours_end_et, holiday_name, source, provider_as_of, updated_at)
       VALUES
         (((now() AT TIME ZONE 'America/New_York')::date + 3), 'closed', '09:30', '16:00', '20:00', 'Near Holiday', 'test', now(), now()),
         (((now() AT TIME ZONE 'America/New_York')::date + 60), 'early_close', '09:30', '13:00', '17:00', 'Far Early Close', 'test', now(), now())`,
    );
    const res = await callAs(client, "authenticated", ADMIN);
    const cal = (res as { body: Record<string, unknown> }).body.calendar as Record<string, unknown>;
    assertEquals(cal.loaded, true);
    const rows = cal.exceptions as Array<Record<string, unknown>>;
    assertEquals(rows.length, 1, "far row outside +14 day window excluded");
    assertEquals(rows[0].holiday_name, "Near Holiday");
    assertEquals(rows[0].regular_open_et, "09:30:00");
    assertEquals(Object.keys(rows[0]).sort(), [
      "after_hours_end_et",
      "holiday_name",
      "market_status",
      "regular_close_et",
      "regular_open_et",
      "session_date",
    ]);
    assert(typeof cal.max_session_date === "string" && typeof cal.today_et === "string");
    assert(!JSON.stringify(cal).includes("source"), "provider source not returned");
    await client.queryObject(`DELETE FROM public.market_session_calendar`);
  });
});

Deno.test("Batch 213 call is read-only: rows and updated_at unchanged", async () => {
  await withPg(async (client) => {
    await truncateStaging(client);
    await seedRoles(client);
    await insertJob(client, { status: "chunking", createdAt: minutesAgo(3), nextChunk: 2 });
    const before = await client.queryObject<{ n: number; u: string }>(
      `SELECT count(*)::int AS n, max(updated_at)::text AS u FROM public.screener_sync_generation_jobs`,
    );
    const res = await callAs(client, "authenticated", ADMIN);
    assert(res.ok);
    const after = await client.queryObject<{ n: number; u: string }>(
      `SELECT count(*)::int AS n, max(updated_at)::text AS u FROM public.screener_sync_generation_jobs`,
    );
    assertEquals(after.rows[0], before.rows[0]);
  });
});
