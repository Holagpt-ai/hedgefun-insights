import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createSupabaseSyncStagingStore,
  type StagingTableClient,
} from "./sync-staging-supabase.ts";

Deno.test("publishStagedGeneration maps PostgREST replace validation error to slug", async () => {
  const sb = {
    rpc(name: string) {
      if (name !== "publish_screener_sync_staged_generation_v1") {
        throw new Error(`unexpected rpc ${name}`);
      }
      return Promise.resolve({
        data: null,
        error: {
          code: "P0001",
          message: "publish_screener_sync_staged_generation_v1",
          details: "nonpositive volume",
        },
      });
    },
  } as unknown as StagingTableClient;

  const store = createSupabaseSyncStagingStore(sb);
  const result = await store.publishStagedGeneration({
    jobId: crypto.randomUUID(),
    finalizeLeaseToken: crypto.randomUUID(),
    expectedStateVersion: 0,
    syncRunId: crypto.randomUUID(),
    syncedAt: new Date().toISOString(),
    nhlBaselineStatus: "initializing",
    tabEvaluationEvidence: {},
    rows: [],
    nowMs: Date.now(),
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason, "nonpositive_volume");
  }
});

Deno.test("publishStagedGeneration keeps staging_rpc_missing for absent RPC", async () => {
  const sb = {
    rpc() {
      return Promise.resolve({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.publish_screener_sync_staged_generation_v1",
        },
      });
    },
  } as unknown as StagingTableClient;

  const store = createSupabaseSyncStagingStore(sb);
  const result = await store.publishStagedGeneration({
    jobId: crypto.randomUUID(),
    finalizeLeaseToken: crypto.randomUUID(),
    expectedStateVersion: 0,
    syncRunId: crypto.randomUUID(),
    syncedAt: new Date().toISOString(),
    nhlBaselineStatus: "initializing",
    tabEvaluationEvidence: {},
    rows: [],
    nowMs: Date.now(),
  });

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason, "staging_rpc_missing");
  }
});
