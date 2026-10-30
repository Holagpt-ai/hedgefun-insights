import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

const MIGRATION_REL =
  "../../../migrations/20261030193000_screener_sync_staging_rpc_acl_hardening_v1.sql";

const FUNCTIONS = [
  "claim_screener_sync_lease_v1(uuid, uuid, timestamptz, timestamptz, text)",
  "complete_screener_sync_publish_v1(uuid, uuid, integer, timestamptz)",
  "record_screener_sync_publish_rpc_v1(uuid, uuid, integer, uuid, integer, timestamptz)",
  "expire_screener_sync_stale_jobs_v1(timestamptz, interval)",
  "publish_screener_sync_staged_generation_v1(uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz)",
] as const;

Deno.test("contract: Batch 190.5 staging RPC ACL hardening migration", async () => {
  const raw = await Deno.readTextFile(new URL(MIGRATION_REL, import.meta.url));
  const sql = raw.replaceAll("\r\n", "\n");
  assert(sql.includes("FROM PUBLIC, anon, authenticated"));
  for (const fn of FUNCTIONS) {
    const name = fn.split("(")[0];
    assert(sql.includes(`REVOKE ALL ON FUNCTION public.${name}`));
    assert(sql.includes(`GRANT EXECUTE ON FUNCTION public.${name}`));
    assert(sql.includes("TO service_role"));
  }
});
