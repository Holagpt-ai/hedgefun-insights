/**
 * Batch 226 Postgres regression — Penny handoff RPC hardening.
 * Requires disposable DB + migration file on disk (CI screener-sync-pg service).
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import type { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { withPg } from "./sync-staging-postgres-helpers.ts";

const SESSION = "2026-11-11";
const GEN_MS = 1_732_000_000_000;
const GEN_ISO = new Date(GEN_MS).toISOString();
const CAPTURE = "2026-11-11T15:00:00.000Z";
const IDEM = `${SESSION}:PNY:penny_continuation_v1:gen-pg:1`;

let migrationApplied = false;

async function applyPennyMigration(client: Client): Promise<void> {
  if (migrationApplied) return;
  const root = Deno.cwd();
  await client.queryObject(await Deno.readTextFile(
    join(root, "supabase", "tests", "penny-handoff-pg", "00-bootstrap.sql"),
  ));
  await client.queryObject(`DROP TABLE IF EXISTS public.penny_continuation_workflow_handoffs CASCADE`);
  await client.queryObject(await Deno.readTextFile(
    join(root, "supabase", "migrations", "20261112103000_penny_continuation_workflow_handoffs_v1.sql"),
  ));
  migrationApplied = true;
}

function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol: "PNY",
    source_session_date: SESSION,
    capture_at: CAPTURE,
    symbol_observation_at: "2026-11-11T14:59:55.000Z",
    handoff_version: "penny_continuation_workflow_handoff_v1",
    integration_version: "penny_continuation_integration_v1",
    model_version: "penny_continuation_v1",
    publication_idempotency_key: IDEM,
    observation_generation_id: "gen-pg",
    generation_sync_ms: GEN_MS,
    generation_sync_at: GEN_ISO,
    continuation_qualified: true,
    publication_suppressed: false,
    qualification_evidence_kind: "live_market",
    valid_from_session_date: SESSION,
    valid_through_session_date: SESSION,
    badge_payload: {
      kind: "penny_continuation_v1",
      symbol: "PNY",
      sessionDate: SESSION,
      continuationQualified: true,
      corePassCount: 4,
      dataFreshnessLabel: "delayed",
      score: 70,
      supplementalLabels: [],
      model_version: "penny_continuation_v1",
    },
    rank_snapshot: { core_pass_count: 4, score: 70 },
    ...overrides,
  };
}

Deno.test({
  name: "batch226 pg upsert inserts and idempotent replay is not applied",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
  const first = await client.queryObject<{ r: Record<string, unknown> }>(
    `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS r`,
    [JSON.stringify(validRow())],
  );
  assertEquals(first.rows[0].r.applied, true);
  assertEquals(first.rows[0].r.reason, "inserted");
  const second = await client.queryObject<{ r: Record<string, unknown> }>(
    `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS r`,
    [JSON.stringify(validRow())],
  );
  assertEquals(second.rows[0].r.applied, false);
  assertEquals(second.rows[0].r.reason, "already_current");
    await client.queryObject("ROLLBACK");
  });
});

Deno.test({
  name: "batch226 pg upsert rejects missing continuation_qualified",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
    const row = validRow();
    delete row.continuation_qualified;
    const r = await client.queryObject<{ res: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS res`,
      [JSON.stringify(row)],
    );
    assertEquals(r.rows[0].res.applied, false);
    assertEquals(r.rows[0].res.reason, "invalid_body");
    await client.queryObject("ROLLBACK");
  });
});

Deno.test({
  name: "batch226 pg stale generation does not apply",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
    await client.queryObject(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb)`,
      [JSON.stringify(validRow())],
    );
    const stale = validRow({
      generation_sync_ms: GEN_MS - 10_000,
      generation_sync_at: new Date(GEN_MS - 10_000).toISOString(),
      publication_idempotency_key: `${SESSION}:PNY:penny_continuation_v1:gen-pg:2`,
    });
    const r = await client.queryObject<{ res: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS res`,
      [JSON.stringify(stale)],
    );
    assertEquals(r.rows[0].res.applied, false);
    assertEquals(r.rows[0].res.reason, "stale_generation");
    await client.queryObject("ROLLBACK");
  });
});

Deno.test({
  name: "batch226 pg revoke blocks upsert",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
    await client.queryObject(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb)`,
      [JSON.stringify(validRow())],
    );
    await client.queryObject(
      `SELECT public.penny_continuation_handoff_revoke_v1($1, $2::date)`,
      ["PNY", SESSION],
    );
    const r = await client.queryObject<{ res: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS res`,
      [JSON.stringify(validRow({
        generation_sync_ms: GEN_MS + 60_000,
        generation_sync_at: new Date(GEN_MS + 60_000).toISOString(),
      }))],
    );
    assertEquals(r.rows[0].res.applied, false);
    assertEquals(r.rows[0].res.reason, "revoked");
    await client.queryObject("ROLLBACK");
  });
});

Deno.test({
  name: "batch226 pg list requires bounded pairs and returns projection",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
    await client.queryObject(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb)`,
      [JSON.stringify(validRow())],
    );
    await client.queryObject("SET LOCAL ROLE authenticated");
    const empty = await client.queryObject<{ body: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_list_active_v1($1::date, '[]'::jsonb) AS body`,
      [SESSION],
    );
    assertEquals(empty.rows[0].body.error, "invalid_pairs");

    const list = await client.queryObject<{ body: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_list_active_v1(
         $1::date,
         $2::jsonb
       ) AS body`,
      [SESSION, JSON.stringify([{ symbol: "PNY", source_session_date: SESSION }])],
    );
    const body = list.rows[0].body;
    assertEquals(body.projection_version, "penny_continuation_handoff_read_v1");
    const items = body.items as unknown[];
    assertEquals(items.length, 1);
    const row = items[0] as Record<string, unknown>;
    assertEquals(row.symbol, "PNY");
    assertEquals(row.handoff_version, "penny_continuation_workflow_handoff_v1");
    assert(!("id" in row));
    assert(!("generation_sync_ms" in row));
    await client.queryObject("ROLLBACK");
  });
});

Deno.test({
  name: "batch226 pg live_market next_session_carry upsert accepted",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  const NEXT = "2026-11-12";
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
    const row = validRow({
      qualification_evidence_kind: "live_market",
      valid_from_session_date: NEXT,
      valid_through_session_date: NEXT,
      badge_payload: {
        kind: "penny_continuation_v1",
        symbol: "PNY",
        sessionDate: SESSION,
        continuationQualified: true,
        corePassCount: 4,
        dataFreshnessLabel: "delayed",
        score: 70,
        supplementalLabels: ["next_session_carry"],
        model_version: "penny_continuation_v1",
      },
    });
    const r = await client.queryObject<{ res: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS res`,
      [JSON.stringify(row)],
    );
    assertEquals(r.rows[0].res.applied, true);
    await client.queryObject("ROLLBACK");
  });
});

Deno.test({
  name: "batch226 pg concurrent newer write wins and stale is rejected",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
    await client.queryObject(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb)`,
      [JSON.stringify(validRow())],
    );
    const newer = validRow({
      generation_sync_ms: GEN_MS + 120_000,
      generation_sync_at: new Date(GEN_MS + 120_000).toISOString(),
      publication_idempotency_key: `${SESSION}:PNY:penny_continuation_v1:gen-pg:2`,
    });
    const newerRes = await client.queryObject<{ res: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS res`,
      [JSON.stringify(newer)],
    );
    assertEquals(newerRes.rows[0].res.applied, true);
    const stale = validRow({
      generation_sync_ms: GEN_MS + 60_000,
      generation_sync_at: new Date(GEN_MS + 60_000).toISOString(),
      publication_idempotency_key: `${SESSION}:PNY:penny_continuation_v1:gen-pg:3`,
    });
    const staleRes = await client.queryObject<{ res: Record<string, unknown> }>(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb) AS res`,
      [JSON.stringify(stale)],
    );
    assertEquals(staleRes.rows[0].res.applied, false);
    assertEquals(staleRes.rows[0].res.reason, "stale_generation");
    await client.queryObject("ROLLBACK");
  });
});

Deno.test({
  name: "batch226 pg authenticated cannot read table directly",
  sanitizeOps: false,
  sanitizeResources: false,
}, async () => {
  await withPg(async (client) => {
    await applyPennyMigration(client);
    await client.queryObject("BEGIN");
    await client.queryObject("SET LOCAL ROLE service_role");
    await client.queryObject(
      `SELECT public.penny_continuation_handoff_upsert_v1($1::jsonb)`,
      [JSON.stringify(validRow())],
    );
    await client.queryObject("SET LOCAL ROLE authenticated");
    let denied = false;
    try {
      await client.queryObject(`SELECT count(*) FROM public.penny_continuation_workflow_handoffs`);
    } catch {
      denied = true;
    }
    assert(denied);
    await client.queryObject("ROLLBACK");
  });
});
