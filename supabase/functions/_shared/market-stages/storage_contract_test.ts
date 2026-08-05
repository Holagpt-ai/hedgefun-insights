// Market Stages P2C-B R1 — focused STATIC database contract checks.
// These tests assert migration SQL text against the approved four-table contract.
// They do NOT execute SQL against Postgres. DB-executed gates remain separate.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL =
  "../../../migrations/20260805143000_market_stages_p2c_b_storage.sql";

async function loadMigration(): Promise<string> {
  const url = new URL(MIGRATION_REL, import.meta.url);
  return await Deno.readTextFile(url);
}

function assertIncludes(sql: string, snippet: string, label: string): void {
  assert(sql.includes(snippet), `missing ${label}: ${snippet}`);
}

Deno.test("static: migration creates exactly the four approved tables", async () => {
  const sql = await loadMigration();
  const creates = [
    ...sql.matchAll(/CREATE TABLE public\.(market_stage_[a-z_]+)/g),
  ].map((m) => m[1]);
  assertEquals(creates.sort(), [
    "market_stage_state",
    "market_stage_timeline_generations",
    "market_stage_transitions",
    "market_stage_weekly_evaluations",
  ]);
});

Deno.test("static R1-1: replay idempotency uses typed sentinels without text casts", async () => {
  const sql = await loadMigration();
  assertIncludes(
    sql,
    "market_stage_timeline_generations_replay_idem_uidx",
    "replay index name",
  );
  assert(
    !sql.includes("parent_generation_id::text"),
    "must not cast parent uuid to text",
  );
  assert(
    !sql.includes("trigger_week_end::text"),
    "must not cast trigger week to text",
  );
  assertIncludes(
    sql,
    "COALESCE(parent_generation_id, '00000000-0000-0000-0000-000000000000'::uuid)",
    "uuid sentinel",
  );
  assertIncludes(
    sql,
    "COALESCE(trigger_week_end, DATE '0001-01-01')",
    "date sentinel",
  );
  assertIncludes(
    sql,
    "COALESCE(trigger_fingerprint, '')",
    "fingerprint sentinel",
  );
  assertIncludes(
    sql,
    "market_stage_timeline_generations_id_not_zero_uuid_chk",
    "zero uuid rejected",
  );
  assertIncludes(
    sql,
    "id <> '00000000-0000-0000-0000-000000000000'::uuid",
    "zero uuid check body",
  );
  assertIncludes(
    sql,
    "WHERE status IN ('building', 'active', 'superseded')",
    "partial predicate",
  );
  // Leading keys preserved: symbol, algorithm_id, reason before COALESCE keys.
  const idx = sql.indexOf("market_stage_timeline_generations_replay_idem_uidx");
  const block = sql.slice(idx, idx + 600);
  assert(block.includes("symbol,"), "leading symbol");
  assert(block.includes("algorithm_id,"), "leading algorithm");
  assert(block.includes("reason,"), "leading reason");
});

Deno.test("static R1-3: status-shape requires non-null p1_status for P1-backed rows", async () => {
  const sql = await loadMigration();
  const start = sql.indexOf("market_stage_weekly_evaluations_status_shape_chk");
  assert(start >= 0, "status shape constraint present");
  const block = sql.slice(start, start + 900);
  assert(
    block.includes("evaluation_status = 'ok'") &&
      block.includes("p1_status IS NOT NULL") &&
      block.includes("p1_status = 'ok'"),
    "ok requires non-null p1_status = ok",
  );
  assert(
    block.includes(
      "evaluation_status IN ('insufficient_data', 'invalid_input')",
    ) &&
      block.includes("p1_status = evaluation_status"),
    "non-ok P1 statuses coupled",
  );
  // Explicit IS NOT NULL appears for both P1-backed branches.
  const notNullCount = (block.match(/p1_status IS NOT NULL/g) ?? []).length;
  assert(
    notNullCount >= 2,
    `expected >=2 p1_status IS NOT NULL, got ${notNullCount}`,
  );
  assert(
    block.includes("evaluation_status = 'unavailable'") &&
      block.includes("p1_status IS NULL"),
    "unavailable keeps null p1_status",
  );
});

Deno.test("static R1-2: exactly one SECURITY DEFINER active-generation helper", async () => {
  const sql = await loadMigration();
  const fnMatches = [
    ...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)/gi),
  ].map((m) => m[1]);
  assertEquals(fnMatches, ["market_stage_generation_is_active"]);

  assertIncludes(
    sql,
    "CREATE OR REPLACE FUNCTION public.market_stage_generation_is_active(",
    "helper signature",
  );
  assertIncludes(sql, "p_generation_id uuid", "arg1");
  assertIncludes(sql, "p_symbol text", "arg2");
  assertIncludes(sql, "p_algorithm_id text", "arg3");
  assertIncludes(sql, "RETURNS boolean", "returns boolean");
  assertIncludes(sql, "LANGUAGE sql", "language sql");
  assertIncludes(sql, "STABLE", "stable");
  assertIncludes(sql, "SECURITY DEFINER", "security definer");
  assertIncludes(sql, "SET search_path = ''", "fixed search_path");
  assertIncludes(
    sql,
    "FROM public.market_stage_timeline_generations g",
    "fully qualified table",
  );
  assertIncludes(sql, "g.status = 'active'", "active status required");
  const bodyStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.market_stage_generation_is_active",
  );
  const dollar = sql.indexOf("AS $$", bodyStart);
  const bodyEnd = sql.indexOf("$$;", dollar);
  assert(dollar >= 0 && bodyEnd > dollar, "sql function body delimiters");
  const body = sql.slice(dollar, bodyEnd);
  assert(!/EXECUTE\s+/i.test(body), "no dynamic SQL execute in body");
  assert(
    !/INSERT |UPDATE |DELETE /i.test(body),
    "helper body must be read-only",
  );
  assert(body.includes("SELECT EXISTS"), "body is SELECT EXISTS");

  assertIncludes(
    sql,
    "REVOKE ALL ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) FROM PUBLIC",
    "revoke public",
  );
  assertIncludes(
    sql,
    "REVOKE ALL ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) FROM anon",
    "revoke anon",
  );
  assertIncludes(
    sql,
    "REVOKE ALL ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) FROM authenticated",
    "revoke authenticated before grant",
  );
  assertIncludes(
    sql,
    "GRANT EXECUTE ON FUNCTION public.market_stage_generation_is_active(uuid, text, text) TO authenticated",
    "grant execute authenticated",
  );
});

Deno.test("static R1-2: authenticated policies call helper and do not select generations", async () => {
  const sql = await loadMigration();
  const statePol = sql.slice(
    sql.indexOf("CREATE POLICY market_stage_state_authenticated_select"),
    sql.indexOf("CREATE POLICY market_stage_transitions_authenticated_select"),
  );
  const transPol = sql.slice(
    sql.indexOf("CREATE POLICY market_stage_transitions_authenticated_select"),
  );
  assert(
    statePol.includes("public.market_stage_generation_is_active("),
    "state policy calls helper",
  );
  assert(
    transPol.includes("public.market_stage_generation_is_active("),
    "transition policy calls helper",
  );
  assert(
    transPol.includes("market_stage_transitions.status = 'active'"),
    "transition status gate preserved",
  );
  assert(
    !statePol.includes("FROM public.market_stage_timeline_generations"),
    "state policy must not select generations",
  );
  assert(
    !transPol.includes("FROM public.market_stage_timeline_generations"),
    "transition policy must not select generations",
  );
});

Deno.test("static R1-4: evaluations immutable to service_role; grant matrix preserved", async () => {
  const sql = await loadMigration();
  assertIncludes(
    sql,
    "GRANT SELECT, INSERT ON TABLE public.market_stage_weekly_evaluations TO service_role",
    "evaluations select/insert only",
  );
  assert(
    !/GRANT SELECT, INSERT, UPDATE ON TABLE public\.market_stage_weekly_evaluations TO service_role/
      .test(sql),
    "evaluations must not grant UPDATE",
  );
  assertIncludes(
    sql,
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.market_stage_timeline_generations TO service_role",
    "generations grant",
  );
  assertIncludes(
    sql,
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.market_stage_state TO service_role",
    "state grant",
  );
  assertIncludes(
    sql,
    "GRANT SELECT, INSERT, UPDATE ON TABLE public.market_stage_transitions TO service_role",
    "transitions grant",
  );
  for (
    const table of [
      "market_stage_timeline_generations",
      "market_stage_weekly_evaluations",
      "market_stage_state",
      "market_stage_transitions",
    ]
  ) {
    assert(
      !new RegExp(`GRANT\\s+.*DELETE.*ON TABLE public\\.${table}`, "i").test(
        sql,
      ),
      `${table} must not grant DELETE`,
    );
  }
  assert(
    !/GRANT SELECT ON TABLE public\.market_stage_timeline_generations TO authenticated/
      .test(sql),
    "auth no generations select",
  );
  assert(
    !/GRANT SELECT ON TABLE public\.market_stage_weekly_evaluations TO authenticated/
      .test(sql),
    "auth no evaluations select",
  );
  assertIncludes(
    sql,
    "GRANT SELECT ON TABLE public.market_stage_state TO authenticated",
    "auth state select",
  );
  assertIncludes(
    sql,
    "GRANT SELECT ON TABLE public.market_stage_transitions TO authenticated",
    "auth transitions select",
  );
});

Deno.test("static R1-5: event identity uses DateStyle-independent to_char", async () => {
  const sql = await loadMigration();
  const start = sql.indexOf("market_stage_transitions_event_identity_chk");
  assert(start >= 0, "identity constraint present");
  const block = sql.slice(start, start + 700);
  assertIncludes(
    block,
    "to_char(effective_week_end, 'YYYY-MM-DD')",
    "effective to_char",
  );
  assertIncludes(
    block,
    "to_char(confirmed_week_end, 'YYYY-MM-DD')",
    "confirmed to_char",
  );
  assert(
    !block.includes("effective_week_end::text"),
    "no effective date::text",
  );
  assert(
    !block.includes("confirmed_week_end::text"),
    "no confirmed date::text",
  );
  assert(
    block.includes("algorithm_id") &&
      block.includes("from_stage") &&
      block.includes("to_stage"),
    "canonical field order retained",
  );
});

Deno.test("static: evaluations Friday/observation uniqueness and state invariants remain", async () => {
  const sql = await loadMigration();
  assertIncludes(
    sql,
    "UNIQUE (generation_id, effective_week_end)",
    "one week per generation",
  );
  assertIncludes(
    sql,
    "COALESCE(input_fingerprint, '')",
    "observation coalesce",
  );
  assertIncludes(
    sql,
    "EXTRACT(ISODOW FROM effective_week_end) = 5",
    "friday",
  );
  assertIncludes(sql, "PRIMARY KEY (symbol, algorithm_id)", "state pk");
  assertIncludes(sql, "revision >= 1", "revision floor");
  assertIncludes(
    sql,
    "confirmed_at_week_end = (confirmed_effective_week_end + 7)",
    "confirmed +7",
  );
  assertIncludes(sql, "from_stage <> to_stage", "no same-stage event");
  assertIncludes(
    sql,
    "alert_eligible boolean NOT NULL DEFAULT false",
    "alert default false",
  );
  assertIncludes(
    sql,
    "Correction/backfill alert_eligible=false is NOT fully enforced by DDL",
    "deferred orchestration note",
  );
});

Deno.test("static: forbidden scope — no extra functions, delivery, scores, cron, entitlements", async () => {
  const sql = await loadMigration();
  const fnMatches = [
    ...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)/gi),
  ].map((m) => m[1]);
  assertEquals(
    fnMatches,
    ["market_stage_generation_is_active"],
    "exactly one approved helper",
  );
  assert(!/CREATE TRIGGER/i.test(sql), "no triggers");
  assert(!/cron\.schedule/i.test(sql), "no cron");
  assert(!/\bnet\.http_post\b/i.test(sql), "no http_post");
  assert(!/\bvault\./i.test(sql), "no vault");
  assert(!/\bentitlement\b/i.test(sql), "no entitlement");
  assert(!/\bconfidence\b/i.test(sql), "no confidence");
  assert(!/\bprobability\b/i.test(sql), "no probability");
  assert(!/\brecommendation\b/i.test(sql), "no recommendation");
  assert(!/\bscore\b/i.test(sql), "no score");
  assert(!/\brank\b/i.test(sql), "no rank");
  assert(!/\btier\b/i.test(sql), "no tier");
  assert(!/ai_classification/i.test(sql), "no ai classification");
  for (
    const term of [
      "delivered_at",
      "sent_at",
      "retry_count",
      "notification_channel",
      "delivery_status",
      "provider_message_id",
    ]
  ) {
    assert(!new RegExp(`\\b${term}\\b`, "i").test(sql), `delivery: ${term}`);
  }
  for (
    const table of [
      "watchlist_analysis_v2",
      "watchlist_alerts_v2",
      "screener_results",
      "screener_feed_state",
      "journal_trades",
    ]
  ) {
    assert(!sql.includes(table), `unrelated table: ${table}`);
  }
});
