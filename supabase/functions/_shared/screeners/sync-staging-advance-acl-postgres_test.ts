/**
 * Batch 190.4 — EXECUTE ACL regression for staging sync RPCs (disposable Postgres only).
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import {
  insertChunkingJob,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

const ADVANCE_SIX_ARG =
  "advance_screener_sync_chunk_v1(uuid,uuid,integer,integer,jsonb,timestamptz)";

const OTHER_STAGING_RPCS = [
  "claim_screener_sync_lease_v1(uuid,uuid,timestamptz,timestamptz,text)",
  "complete_screener_sync_publish_v1(uuid,uuid,integer,timestamptz)",
  "record_screener_sync_publish_rpc_v1(uuid,uuid,integer,uuid,integer,timestamptz)",
  "expire_screener_sync_stale_jobs_v1(timestamptz,interval)",
  "publish_screener_sync_staged_generation_v1(uuid,uuid,integer,jsonb,uuid,timestamptz,text,jsonb,timestamptz)",
] as const;

async function hasExecute(
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

async function publicHasExecute(
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

async function assertStagingRpcIntendedAcl(
  client: Client,
  signature: string,
): Promise<void> {
  assertEquals(await hasExecute(client, "service_role", signature), true);
  assertEquals(await hasExecute(client, "anon", signature), false);
  assertEquals(await hasExecute(client, "authenticated", signature), false);
  assertEquals(await publicHasExecute(client, signature), false);
}

Deno.test("postgres gate 190.4: advance six-arg ACL is service_role only", async () => {
  await withPg(async (client) => {
    await assertStagingRpcIntendedAcl(client, ADVANCE_SIX_ARG);
  });
});

Deno.test("postgres gate 190.4: service_role can execute advance six-arg", async () => {
  await withPg(async (client) => {
    const jobId = crypto.randomUUID();
    const syncRunId = crypto.randomUUID();
    const leaseToken = crypto.randomUUID();
    await insertChunkingJob(client, {
      jobId,
      syncRunId,
      totalChunks: 2,
      nextChunkIndex: 0,
      leaseToken,
      stateVersion: 0,
    });

    await client.queryObject(`SET ROLE service_role`);
    try {
      const out = await client.queryObject<{ advance: unknown }>(
        `SELECT public.advance_screener_sync_chunk_v1(
           $1::uuid, $2::uuid, 0, 0, '{}'::jsonb, now()
         ) AS advance`,
        [jobId, leaseToken],
      );
      const payload = out.rows[0]?.advance as { ok?: boolean } | undefined;
      assertEquals(payload?.ok, true);
    } finally {
      await client.queryObject(`RESET ROLE`);
    }
  });
});

Deno.test("postgres gate 190.4: anon cannot execute advance six-arg", async () => {
  await withPg(async (client) => {
    await client.queryObject(`SET ROLE anon`);
    try {
      await assertRejects(
        () =>
          client.queryObject(
            `SELECT public.advance_screener_sync_chunk_v1(
               gen_random_uuid(), gen_random_uuid(), 0, 0, '{}'::jsonb, now()
             )`,
          ),
        Error,
      );
    } finally {
      await client.queryObject(`RESET ROLE`);
    }
  });
});

Deno.test("postgres gate 190.4: authenticated cannot execute advance six-arg", async () => {
  await withPg(async (client) => {
    await client.queryObject(`SET ROLE authenticated`);
    try {
      await assertRejects(
        () =>
          client.queryObject(
            `SELECT public.advance_screener_sync_chunk_v1(
               gen_random_uuid(), gen_random_uuid(), 0, 0, '{}'::jsonb, now()
             )`,
          ),
        Error,
      );
    } finally {
      await client.queryObject(`RESET ROLE`);
    }
  });
});

Deno.test("postgres gate 190.4: obsolete seven-arg advance overload absent", async () => {
  await withPg(async (client) => {
    const sigs = await client.queryObject<{ args: number; n: number }>(
      `SELECT pronargs AS args, count(*)::int AS n
       FROM pg_proc WHERE proname = 'advance_screener_sync_chunk_v1'
       GROUP BY pronargs`,
    );
    assertEquals(sigs.rows.length, 1);
    assertEquals(sigs.rows[0]?.args, 6);
    assertEquals(sigs.rows[0]?.n, 1);
  });
});

Deno.test("postgres gate 190.4: other staging RPCs retain intended ACL", async () => {
  await withPg(async (client) => {
    for (const signature of OTHER_STAGING_RPCS) {
      await assertStagingRpcIntendedAcl(client, signature);
    }
  });
});
