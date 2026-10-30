import type { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

export const ADVANCE_SIX_ARG =
  "advance_screener_sync_chunk_v1(uuid,uuid,integer,integer,jsonb,timestamptz)";

export const RELEASE_FINALIZE_LEASE_CAS =
  "release_screener_sync_finalize_lease_cas_v1(uuid,integer,uuid,timestamptz)";

export const ALL_STAGING_SYNC_RPCS = [
  ADVANCE_SIX_ARG,
  RELEASE_FINALIZE_LEASE_CAS,
  "claim_screener_sync_lease_v1(uuid,uuid,timestamptz,timestamptz,text)",
  "complete_screener_sync_publish_v1(uuid,uuid,integer,timestamptz)",
  "record_screener_sync_publish_rpc_v1(uuid,uuid,integer,uuid,integer,timestamptz)",
  "expire_screener_sync_stale_jobs_v1(timestamptz,interval)",
  "publish_screener_sync_staged_generation_v1(uuid,uuid,integer,jsonb,uuid,timestamptz,text,jsonb,timestamptz)",
] as const;

export async function hasExecute(
  client: Client,
  role: string,
  signature: string,
): Promise<boolean> {
  const result = await client.queryObject<{ ok: boolean }>(
    `SELECT has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS ok`,
    [role, signature],
  );
  return result.rows[0]?.ok === true;
}

export async function publicHasExecute(
  client: Client,
  signature: string,
): Promise<boolean> {
  const result = await client.queryObject<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_proc p,
            LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
       WHERE p.oid = $1::regprocedure
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) AS ok`,
    [signature],
  );
  return result.rows[0]?.ok === true;
}

export async function assertStagingRpcIntendedAcl(
  client: Client,
  signature: string,
): Promise<void> {
  assertEquals(await hasExecute(client, "service_role", signature), true);
  assertEquals(await hasExecute(client, "anon", signature), false);
  assertEquals(await hasExecute(client, "authenticated", signature), false);
  assertEquals(await publicHasExecute(client, signature), false);
}

export async function applySqlFile(client: Client, fileUrl: URL): Promise<void> {
  const raw = await Deno.readTextFile(fileUrl);
  const withoutComments = raw.replace(/^\s*--[^\n]*\n?/gm, "");
  const statements = withoutComments
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await client.queryObject(`${statement};`);
  }
}
