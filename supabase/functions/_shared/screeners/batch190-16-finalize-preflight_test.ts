import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { isExtendedSyncSession } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import {
  jobFromRow,
  jobInsertRowJsonRoundTrip,
  jobToPreflightView,
  STAGING_JOB_PREFLIGHT_SELECT,
} from "./sync-staging-serialize.ts";
import {
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";
import { runBatch19016PreflightPayloadBenchmark } from "./batch190-16-preflight-benchmark.ts";

Deno.test("Batch 190.16: preflight select omits universe columns", () => {
  assertEquals(STAGING_JOB_PREFLIGHT_SELECT.includes("all_tickers"), false);
  assertEquals(STAGING_JOB_PREFLIGHT_SELECT.includes("merged_artifacts"), false);
  assertEquals(STAGING_JOB_PREFLIGHT_SELECT.includes("gainers"), false);
});

Deno.test("Batch 190.16: partial row deserializes without universe payloads", () => {
  const nowMs = Date.parse("2026-11-05T20:00:00.000Z");
  const universe = buildRepresentativeUniverse(128, "regular", nowMs);
  const full = jobInsertRowJsonRoundTrip({
    id: crypto.randomUUID(),
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind: resolveSyncSessionKind(nowMs),
      extendedSession: false,
      observationSessionFields: true,
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: crypto.randomUUID(),
    },
    allTickers: universe,
    gainers: universe.slice(0, 20),
    losers: universe.slice(20, 40),
    chunkSize: 2200,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: true,
    nhlBaselineSnapshot: null,
    stateVersion: 7,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: null,
    finalizeLeaseExpiresMs: null,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });
  const row = JSON.parse(JSON.stringify(full));
  delete (row as Record<string, unknown>).all_tickers;
  delete (row as Record<string, unknown>).gainers;
  delete (row as Record<string, unknown>).losers;
  delete (row as Record<string, unknown>).merged_artifacts;
  const preflight = jobFromRow(row);
  assertEquals(preflight.allTickers.length, 0);
  assertEquals(preflight.merged.primaryAccum.dayTrade, 0);
});

Deno.test("Batch 190.16: memory getPreflight strips heavy fields", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.now();
  const universe = buildRepresentativeUniverse(64, "regular", nowMs);
  const id = crypto.randomUUID();
  store.seedJob({
    id,
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind: resolveSyncSessionKind(nowMs),
      extendedSession: isExtendedSyncSession(resolveSyncSessionKind(nowMs)),
      observationSessionFields: isLiveSurveillanceSessionKind(
        resolveSyncSessionKind(nowMs),
      ),
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId: crypto.randomUUID(),
    },
    allTickers: universe,
    gainers: universe.slice(0, 5),
    losers: [],
    chunkSize: 2200,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: {
      ...emptyChunkArtifacts(),
      primaryAccum: { ...emptyChunkArtifacts().primaryAccum, dayTrade: 99 },
    },
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 1,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: null,
    finalizeLeaseExpiresMs: null,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });
  const full = await store.get(id);
  const light = await store.getPreflight(id);
  assertEquals(full!.allTickers.length, 64);
  assertEquals(light!.allTickers.length, 0);
  assertEquals(light!.merged.primaryAccum.dayTrade, 0);
});

Deno.test("Batch 190.16: payload benchmark (~13k universe + NHL snapshot)", () => {
  const sample = runBatch19016PreflightPayloadBenchmark(REPRESENTATIVE_UNIVERSE_SIZE);
  console.log("[batch190-16-payload]", JSON.stringify(sample));
  assert(sample.fullRowBytes > sample.preflightRowBytes * 4);
  assert(sample.nhlBaselineSnapshotBytes > 240_000);
  assert(sample.nhlBaselineSnapshotBytes < 330_000);
  assert(sample.preflightRowBytes > sample.nhlBaselineSnapshotBytes);
  assert(sample.fullJobParseMs >= 0);
  assert(sample.preflightParseMs >= 0);
});
