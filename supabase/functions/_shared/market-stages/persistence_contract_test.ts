// Market Stages P2D — static SQL contract checks for forward persistence RPC.
// These tests assert migration SQL text. They do NOT execute against Postgres.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL =
  "../../../migrations/20260809160000_market_stages_p2d_forward_persistence.sql";

async function loadMigration(): Promise<string> {
  const url = new URL(MIGRATION_REL, import.meta.url);
  return await Deno.readTextFile(url);
}

function functionBody(sql: string): string {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.persist_market_stage_forward_v1",
  );
  assert(start >= 0, "RPC definition present");
  const dollar = sql.indexOf("AS $fn$", start);
  const end = sql.indexOf("$fn$;", dollar);
  assert(dollar >= 0 && end > dollar, "function body delimiters");
  return sql.slice(dollar, end);
}

function assertIncludes(sql: string, snippet: string, label: string): void {
  assert(sql.includes(snippet), `missing ${label}: ${snippet}`);
}

Deno.test("static: creates persist_market_stage_forward_v1 with established security pattern", async () => {
  const sql = await loadMigration();
  assertIncludes(
    sql,
    "CREATE OR REPLACE FUNCTION public.persist_market_stage_forward_v1(",
    "function name",
  );
  assertIncludes(sql, "RETURNS jsonb", "returns jsonb");
  assertIncludes(sql, "LANGUAGE plpgsql", "plpgsql");
  assertIncludes(sql, "SECURITY DEFINER", "security definer");
  assertIncludes(sql, "SET search_path = ''", "empty search_path");

  assertIncludes(
    sql,
    "REVOKE ALL ON FUNCTION public.persist_market_stage_forward_v1(",
    "revoke block",
  );
  assertIncludes(sql, "FROM PUBLIC", "revoke public");
  assertIncludes(sql, "FROM anon", "revoke anon");
  assertIncludes(sql, "FROM authenticated", "revoke authenticated");
  assertIncludes(
    sql,
    "GRANT EXECUTE ON FUNCTION public.persist_market_stage_forward_v1(",
    "grant execute",
  );
  assertIncludes(sql, "TO service_role", "service_role only");

  // Exactly one GRANT EXECUTE target.
  const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO\s+(\w+)/g)];
  assertEquals(grants.length, 1, "exactly one GRANT EXECUTE");
  assertEquals(grants[0][1], "service_role");
});

Deno.test("static: transaction advisory lock derived from symbol and algorithm", async () => {
  const body = functionBody(await loadMigration());
  assertIncludes(body, "pg_advisory_xact_lock(", "advisory xact lock");
  assertIncludes(body, "hashtext('market_stages.forward.v1')", "namespace key");
  assertIncludes(
    body,
    "hashtext(p_symbol || chr(1) || p_algorithm_id)",
    "symbol/algorithm key",
  );
});

Deno.test("static: active-generation checks and CAS revision guard", async () => {
  const body = functionBody(await loadMigration());
  assertIncludes(body, "v_gen.status <> 'active'", "reject non-active");
  assertIncludes(body, "'inactive_generation'", "inactive outcome");
  assertIncludes(body, "FOR UPDATE", "row locks");
  assertIncludes(
    body,
    "AND s.active_generation_id = v_gen_id",
    "generation CAS",
  );
  assertIncludes(body, "AND s.revision = p_expected_revision", "revision CAS");
  assertIncludes(
    body,
    "p_next_revision <> (p_expected_revision + 1)",
    "next = expected + 1",
  );
  assertIncludes(body, "'stale_revision'", "stale revision outcome");
  assertIncludes(
    body,
    "RAISE EXCEPTION 'market_stages_forward_cas_failed'",
    "zero-row CAS fails closed",
  );
});

Deno.test("static: immutable evaluation writes; no DELETE authority", async () => {
  const sql = await loadMigration();
  const body = functionBody(sql);
  assertIncludes(
    body,
    "INSERT INTO public.market_stage_weekly_evaluations",
    "evaluation insert",
  );
  assert(
    !/UPDATE\s+public\.market_stage_weekly_evaluations/i.test(body),
    "must not update weekly evaluations",
  );
  assert(
    !/\bDELETE\s+FROM\b/i.test(body),
    "RPC body must not DELETE FROM",
  );
  assert(
    !/\bDELETE\s+FROM\b/i.test(sql),
    "migration must not DELETE FROM",
  );
});

Deno.test("static: genesis building→active and alert_eligible=false enforcement", async () => {
  const body = functionBody(await loadMigration());
  assertIncludes(body, "'genesis'", "genesis reason");
  assertIncludes(body, "parent_generation_id", "parent null column");
  assertIncludes(body, "'building'", "building status");
  assertIncludes(body, "SET status = 'active'", "activate in-tx");
  assertIncludes(body, "activated_at = now()", "activated timestamp");
  assertIncludes(body, "p_expected_revision = 0", "genesis revision 0");

  // Transition inserts always force alert_eligible false.
  const insertIdx = body.indexOf(
    "INSERT INTO public.market_stage_transitions",
  );
  assert(insertIdx >= 0, "transition insert present");
  const insertBlocks = [
    ...body.matchAll(/INSERT INTO public\.market_stage_transitions[\s\S]*?;/g),
  ];
  assert(insertBlocks.length >= 1, "at least one transition insert");
  for (const m of insertBlocks) {
    assert(
      m[0].includes("alert_eligible"),
      "alert_eligible column listed",
    );
    assert(
      /alert_eligible[\s\S]*false/.test(m[0]) ||
        m[0].includes("false\n") ||
        m[0].includes(",\n        false"),
      "alert_eligible forced false",
    );
  }
  assert(
    !/alert_eligible\s*=\s*true/i.test(body),
    "must never set alert_eligible true",
  );
});

Deno.test("static: no authenticated/anon execute; rejects building/superseded/failed via active check", async () => {
  const sql = await loadMigration();
  assert(
    !/GRANT EXECUTE[\s\S]*TO authenticated/.test(sql),
    "no authenticated execute",
  );
  assert(
    !/GRANT EXECUTE[\s\S]*TO anon/.test(sql),
    "no anon execute",
  );
  const body = functionBody(sql);
  assertIncludes(body, "status IN ('building', 'active')", "genesis occupancy");
  assertIncludes(body, "v_gen.status <> 'active'", "active-only forward path");
});

Deno.test("static: forbidden scope — no cron, delivery, replay rebuild, or DELETE grants", async () => {
  const sql = await loadMigration();
  assert(!/CREATE TRIGGER/i.test(sql), "no triggers");
  assert(!/cron\.schedule/i.test(sql), "no cron");
  assert(!/\bnet\.http_post\b/i.test(sql), "no http_post");
  assert(!/\bcorrection_same_week\b/.test(sql), "no correction reason write");
  assert(!/\bbackfill_adjusted\b/.test(sql), "no backfill reason write");
  assert(!/GRANT[\s\S]*\bDELETE\b/i.test(sql), "no DELETE grants");
  for (
    const term of [
      "delivered_at",
      "sent_at",
      "notification_channel",
      "provider_message_id",
    ]
  ) {
    assert(!new RegExp(`\\b${term}\\b`, "i").test(sql), `delivery: ${term}`);
  }
});
