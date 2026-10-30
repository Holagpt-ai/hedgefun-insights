/**
 * Batch 190.7 — EXECUTE ACL for release_screener_sync_finalize_lease_cas_v1.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  RELEASE_FINALIZE_LEASE_CAS,
  applySqlFile,
  assertStagingRpcIntendedAcl,
  hasExecute,
} from "./sync-staging-postgres-acl-helpers.ts";
import { withPg } from "./sync-staging-postgres-helpers.ts";

const RELEASE_MIGRATION = new URL(
  "../../../migrations/20261030220000_screener_sync_finalize_lease_release_cas_v1.sql",
  import.meta.url,
);

const SIMULATE_LOVABLE_DIRECT_GRANTS = `
GRANT EXECUTE ON FUNCTION public.release_screener_sync_finalize_lease_cas_v1(
  uuid, integer, uuid, timestamptz
) TO anon, authenticated;
`;

Deno.test({
  name: "postgres gate 190.7: release finalize lease CAS RPC is service_role-only after bootstrap",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await assertStagingRpcIntendedAcl(client, RELEASE_FINALIZE_LEASE_CAS);
    });
  },
});

Deno.test({
  name: "postgres gate 190.7: Lovable direct grants removed by migration re-apply",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await client.queryObject(SIMULATE_LOVABLE_DIRECT_GRANTS);
      assertEquals(await hasExecute(client, "anon", RELEASE_FINALIZE_LEASE_CAS), true);
      assertEquals(
        await hasExecute(client, "authenticated", RELEASE_FINALIZE_LEASE_CAS),
        true,
      );

      await applySqlFile(client, RELEASE_MIGRATION);
      await applySqlFile(client, RELEASE_MIGRATION);

      await assertStagingRpcIntendedAcl(client, RELEASE_FINALIZE_LEASE_CAS);
    });
  },
});
