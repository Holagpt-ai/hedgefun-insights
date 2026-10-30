import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

const MIGRATION_REL =
  "../../../migrations/20261030183000_screener_sync_staging_advance_acl_v1.sql";

const SIGNATURE =
  "advance_screener_sync_chunk_v1(uuid, uuid, integer, integer, jsonb, timestamptz)";

Deno.test("contract: Batch 190.4 advance ACL migration", async () => {
  const raw = await Deno.readTextFile(new URL(MIGRATION_REL, import.meta.url));
  const sql = raw.replaceAll("\r\n", "\n");
  assert(sql.includes("REVOKE ALL ON FUNCTION public.advance_screener_sync_chunk_v1("));
  assert(sql.includes(") FROM PUBLIC;"));
  assert(sql.includes(") FROM anon;"));
  assert(sql.includes(") FROM authenticated;"));
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.advance_screener_sync_chunk_v1("));
  assert(sql.includes(") TO service_role;"));
});
