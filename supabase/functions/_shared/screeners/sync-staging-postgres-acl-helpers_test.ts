import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { splitSqlStatements } from "./sync-staging-postgres-acl-helpers.ts";

const RELEASE_MIGRATION = new URL(
  "../../../migrations/20261030220000_screener_sync_finalize_lease_release_cas_v1.sql",
  import.meta.url,
);

Deno.test("splitSqlStatements: preserves dollar-quoted function as one statement", async () => {
  const sql = await Deno.readTextFile(RELEASE_MIGRATION);
  const parts = splitSqlStatements(sql);
  assertEquals(parts.length, 3);
  assertEquals(parts[0].includes("CREATE OR REPLACE FUNCTION"), true);
  assertEquals(parts[0].includes("AS $$"), true);
  assertEquals(parts[0].trimEnd().endsWith("$$"), true);
  assertEquals(parts[1].includes("REVOKE ALL ON FUNCTION"), true);
  assertEquals(parts[2].includes("GRANT EXECUTE ON FUNCTION"), true);
});
