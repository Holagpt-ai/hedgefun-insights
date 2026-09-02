// Static contract checks for Persistence V2 replace RPC fencing.
// Reads migration SQL only. Does not execute against Postgres and does not apply.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION =
  "../../../migrations/20260901150000_radar_v22_persistence_v2.sql";
const RPC_NAME = "replace_radar_v22_candidates_v1";

async function load(): Promise<string> {
  const raw = await Deno.readTextFile(new URL(MIGRATION, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

function functionBody(sql: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${RPC_NAME}`);
  assert(start >= 0, `missing CREATE OR REPLACE for ${RPC_NAME}`);
  const begin = sql.indexOf("AS $fn$", start);
  const end = sql.indexOf("$fn$;", begin + 1);
  assert(begin >= 0 && end > begin, "missing function body delimiters");
  return sql.slice(begin, end);
}

Deno.test("static: v2_synced_at is a dedicated feed_state fence column", async () => {
  const sql = await load();
  assert(sql.includes("ADD COLUMN IF NOT EXISTS v2_synced_at timestamptz NULL"));
  assert(sql.includes("v2_synced_at = EXCLUDED.v2_synced_at"));
  assertFalse(/v2_synced_at\s*=\s*EXCLUDED\.updated_at/.test(sql));
  assertFalse(/v2_synced_at\s*=\s*EXCLUDED\.synced_at/.test(sql));
  assertFalse(/v2_synced_at\s*=\s*EXCLUDED\.last_receive_at/.test(sql));
});

Deno.test("static: RPC returns jsonb fence result, not integer", async () => {
  const sql = await load();
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${RPC_NAME}`);
  const returns = sql.slice(start, sql.indexOf("AS $fn$", start));
  assert(returns.includes("RETURNS jsonb"));
  assertFalse(returns.includes("RETURNS integer"));
});

Deno.test("static: fence locks feed_state FOR UPDATE before DELETE", async () => {
  const body = functionBody(await load());
  const lockAt = body.indexOf("FOR UPDATE");
  const deleteAt = body.indexOf("DELETE FROM public.radar_v22_candidates");
  const staleAt = body.indexOf("stale_generation");
  assert(lockAt >= 0, "missing SELECT FOR UPDATE");
  assert(deleteAt >= 0, "missing candidate DELETE");
  assert(staleAt >= 0, "missing stale_generation branch");
  assert(lockAt < deleteAt, "FOR UPDATE must precede DELETE");
  assert(staleAt < deleteAt, "stale fence must precede DELETE");
  assert(body.includes("WHERE state_key = 'current'"));
  assert(body.includes("radar_v22_feed_state"));
});

Deno.test("static: UUID values are never ordered for fencing", async () => {
  const body = functionBody(await load());
  assertFalse(body.includes("p_generation_id <"));
  assertFalse(body.includes("p_generation_id >"));
  assertFalse(body.includes("v_existing_gen <"));
  assertFalse(body.includes("v_existing_gen >"));
});

Deno.test("static: last_provider_event_at is non-regressive", async () => {
  const body = functionBody(await load());
  assert(body.includes("WHEN EXCLUDED.last_provider_event_at IS NULL THEN"));
  assert(
    body.includes(
      "WHEN public.radar_v22_feed_state.last_provider_event_at IS NULL THEN",
    ),
  );
  assert(
    body.includes(
      "WHEN EXCLUDED.last_provider_event_at >",
    ),
  );
  assertFalse(
    body.includes(
      "last_provider_event_at = COALESCE(\n      EXCLUDED.last_provider_event_at",
    ),
  );
});

Deno.test("static: security surface unchanged", async () => {
  const sql = await load();
  assert(sql.includes("SECURITY DEFINER"));
  assert(sql.includes("SET search_path = ''"));
  assert(
    sql.includes(
      "GRANT EXECUTE ON FUNCTION public.replace_radar_v22_candidates_v1",
    ),
  );
  assert(
    sql.includes(
      "REVOKE ALL ON FUNCTION public.replace_radar_v22_candidates_v1",
    ),
  );
  assert(sql.includes("TO service_role"));
});

Deno.test("static: only one replace_radar_v22_candidates_v1 definition exists", async () => {
  const migrationsDir = new URL("../../../migrations/", import.meta.url);
  const defs: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(entry.name, migrationsDir));
    if (sql.includes(`CREATE OR REPLACE FUNCTION public.${RPC_NAME}`)) {
      defs.push(entry.name);
    }
  }
  defs.sort();
  assertEquals(defs, ["20260901150000_radar_v22_persistence_v2.sql"]);
});
