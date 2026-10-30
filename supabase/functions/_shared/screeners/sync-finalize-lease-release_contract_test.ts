import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationUrl = new URL(
  "../../../migrations/20261030220000_screener_sync_finalize_lease_release_cas_v1.sql",
  import.meta.url,
);

Deno.test("contract: Batch 190.7 finalize lease release CAS migration", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  assert(sql.includes("release_screener_sync_finalize_lease_cas_v1"));
  assert(sql.includes("publish_rows_inserted IS NULL"));
  assert(sql.includes("state_version"));
  assert(sql.includes("finalize_lease_token"));
  assert(sql.includes("FROM PUBLIC, anon, authenticated"));
  assert(sql.includes("TO service_role"));
});
