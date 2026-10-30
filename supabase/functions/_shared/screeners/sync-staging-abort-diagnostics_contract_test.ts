import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationUrl = new URL(
  "../../../migrations/20261030210000_screener_sync_abort_diagnostics_v1.sql",
  import.meta.url,
);

Deno.test("contract: Batch 190.6 abort diagnostics migration", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  assert(sql.includes("abort_reason"));
  assert(sql.includes("abort_evidence"));
  assert(sql.includes("prior_generation_retained"));
  assert(sql.includes("newer_generation_live"));
  assert(sql.includes("pg_column_size(abort_evidence)"));
});
