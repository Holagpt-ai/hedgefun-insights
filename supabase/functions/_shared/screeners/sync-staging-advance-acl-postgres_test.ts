/**
 * Batch 190.4 — EXECUTE ACL regression for staging sync RPCs (disposable Postgres only).
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ADVANCE_SIX_ARG,
  assertStagingRpcIntendedAcl,
} from "./sync-staging-postgres-acl-helpers.ts";
import {
  insertChunkingJob,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

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
