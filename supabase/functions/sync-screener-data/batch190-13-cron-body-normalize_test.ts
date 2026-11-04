import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MemorySyncStagingStore } from "../_shared/screeners/sync-staging-memory.ts";
import { reconcileStrandedPublishedGeneration } from "../_shared/screeners/sync-staging-post-publish-reconcile.ts";
import { emptyChunkArtifacts } from "../_shared/screeners/sync-staging-types.ts";
import { resolveSyncSessionKind } from "../_shared/screeners/session-sync-context.ts";
import { isExtendedSyncSession } from "../_shared/screeners/session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "../_shared/screeners/screener-session.ts";
import { buildStagedJobFromUniverse } from "../_shared/screeners/sync-orchestrator.ts";
import { buildRepresentativeUniverse } from "../_shared/screeners/sync-screener-cpu-benchmark.ts";
import {
  normalizeStagedSyncRequest,
  parseStagedSyncBody,
  StagedSyncBodyParseError,
} from "./sync-staged-handler.ts";

const GEN = "2fe9fca8-a9e3-4db5-ab02-25a6dfe7534e";

function req(body: string): Request {
  return new Request("https://example.com/sync-screener-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

Deno.test("Batch 190.13: {} normalizes to cron", () => {
  assertEquals(normalizeStagedSyncRequest({}), { action: "cron" });
});

Deno.test("Batch 190.13: explicit cron unchanged", () => {
  assertEquals(normalizeStagedSyncRequest({ action: "cron" }), { action: "cron" });
});

Deno.test("Batch 190.13: continue and finalize preserve generation_id", () => {
  assertEquals(
    normalizeStagedSyncRequest({ action: "continue", generation_id: GEN }),
    { action: "continue", generation_id: GEN },
  );
  assertEquals(
    normalizeStagedSyncRequest({ action: "finalize", generation_id: GEN }),
    { action: "finalize", generation_id: GEN },
  );
});

Deno.test("Batch 190.13: parseStagedSyncBody treats {} as cron", async () => {
  assertEquals(await parseStagedSyncBody(req("{}")), { action: "cron" });
  assertEquals(await parseStagedSyncBody(req("")), { action: "cron" });
});

Deno.test("Batch 190.13: rejects unsupported or malformed nonempty bodies", () => {
  const cases: Array<[unknown, string]> = [
    [{ action: "admin" }, "unsupported_action"],
    [{ foo: "bar" }, "missing_action"],
    [{ action: "continue" }, "missing_generation_id"],
    [{ action: "finalize", generation_id: "" }, "missing_generation_id"],
    ["array", "invalid_staged_sync_body"],
  ];
  for (const [body, reason] of cases) {
    let caught = "";
    try {
      normalizeStagedSyncRequest(body);
    } catch (e) {
      caught = e instanceof StagedSyncBodyParseError ? e.reason : String(e);
    }
    assertEquals(caught, reason, JSON.stringify(body));
  }
});

Deno.test("Batch 190.13: cron preflight reconciliation unlocks next generation", async () => {
  const nowMs = Date.parse("2026-11-04T18:00:00.000Z");
  const syncRunId = "09346799-d722-437a-bebf-2eea7a6b5cd7";
  const sessionKind = resolveSyncSessionKind(nowMs);
  const store = new MemorySyncStagingStore();
  store.seedJob({
    id: GEN,
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind,
      extendedSession: isExtendedSyncSession(sessionKind),
      observationSessionFields: isLiveSurveillanceSessionKind(sessionKind),
      syncedAt: "2026-11-02T10:40:01.704Z",
      syncRunId,
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 2200,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: Date.parse("2026-11-02T10:15:00.000Z"),
    updatedAtMs: nowMs,
    nhlBaselineLoaded: true,
    nhlBaselineSnapshot: null,
    stateVersion: 8,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    finalizeLeaseExpiresMs: Date.parse("2026-11-02T10:52:26.000Z"),
    publishRowsInserted: 65,
    publishRpcRecordedAtMs: Date.parse("2026-11-02T10:40:01.704Z"),
    abortReason: null,
    abortEvidence: null,
  });
  const evaluated = { status: "evaluated", selected_count: 0, universe_count: 1 };
  store.seedFeedReconcileSnapshot({
    syncRunId,
    rowsInserted: 65,
    tabEvaluationEvidence: {
      gappers: evaluated,
      gainers_losers: evaluated,
      new_highs_lows: evaluated,
      volume_spikes: evaluated,
      unusual_volume: evaluated,
      day_trade_radar: evaluated,
    },
    persistedRowCount: 65,
  });

  const parsedBody = await parseStagedSyncBody(req("{}"));
  assertEquals(parsedBody.action, "cron");
  if (parsedBody.action === "cron") {
    await store.abortExpired(nowMs);
    const unlocked = await reconcileStrandedPublishedGeneration(store, nowMs);
    assertEquals(unlocked.ok, true);
  }
  const job = await store.get(GEN);
  assertEquals(job?.status, "published");
  const startJob = buildStagedJobFromUniverse(
    buildRepresentativeUniverse(10, "regular", nowMs),
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    crypto.randomUUID(),
    10,
  );
  const acquired = await store.acquireOrCreate(
    startJob,
    crypto.randomUUID(),
    nowMs,
  );
  assertEquals(acquired.ok, true);
});
