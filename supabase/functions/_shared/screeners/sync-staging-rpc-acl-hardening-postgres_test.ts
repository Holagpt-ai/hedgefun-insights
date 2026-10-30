/**
 * Batch 190.5 — staging RPC EXECUTE ACL (Lovable production grant simulation + hardening).
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withPg } from "./sync-staging-postgres-helpers.ts";
import {
  ALL_STAGING_SYNC_RPCS,
  assertStagingRpcIntendedAcl,
  applySqlFile,
  hasExecute,
} from "./sync-staging-postgres-acl-helpers.ts";

const SIMULATE_LOVABLE_GRANTS = new URL(
  "../../../../tests/screener-sync-pg/01-simulate-lovable-staging-rpc-grants.sql",
  import.meta.url,
);
const HARDENING_MIGRATION = new URL(
  "../../../../migrations/20261030193000_screener_sync_staging_rpc_acl_hardening_v1.sql",
  import.meta.url,
);

const LOVABLE_SIMULATED_RPCS = ALL_STAGING_SYNC_RPCS.filter(
  (s) => !s.startsWith("advance_screener_sync_chunk_v1"),
);

Deno.test("postgres gate 190.5: all six staging RPCs are service_role-only after bootstrap", async () => {
  await withPg(async (client) => {
    for (const signature of ALL_STAGING_SYNC_RPCS) {
      await assertStagingRpcIntendedAcl(client, signature);
    }
  });
});

Deno.test("postgres gate 190.5: Lovable direct grants then hardening migration removes anon/authenticated EXECUTE", async () => {
  await withPg(async (client) => {
    await applySqlFile(client, SIMULATE_LOVABLE_GRANTS);

    for (const signature of LOVABLE_SIMULATED_RPCS) {
      assertEquals(await hasExecute(client, "anon", signature), true);
      assertEquals(await hasExecute(client, "authenticated", signature), true);
    }

    await applySqlFile(client, HARDENING_MIGRATION);

    for (const signature of ALL_STAGING_SYNC_RPCS) {
      await assertStagingRpcIntendedAcl(client, signature);
    }
  });
});
