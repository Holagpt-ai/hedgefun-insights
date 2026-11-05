import {
  jobInsertRowJsonRoundTrip,
  jobToPreflightView,
} from "./sync-staging-serialize.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import { buildRepresentativeUniverse } from "./sync-screener-cpu-benchmark.ts";

export type Batch19016PayloadSample = {
  universeSize: number;
  fullRowBytes: number;
  preflightRowBytes: number;
  fullJobParseMs: number;
  preflightParseMs: number;
};

/** Local JSON size / parse timing — not hosted Edge CPU. */
export function runBatch19016PreflightPayloadBenchmark(
  universeSize: number,
): Batch19016PayloadSample {
  const nowMs = Date.parse("2026-11-05T20:00:00.000Z");
  const universe = buildRepresentativeUniverse(universeSize, "regular", nowMs);
  const job = jobInsertRowJsonRoundTrip({
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
  const fullRow = JSON.stringify(job);
  const preflightRow = JSON.stringify(jobToPreflightView(job));

  const fullStart = performance.now();
  JSON.parse(fullRow);
  const fullJobParseMs = performance.now() - fullStart;

  const preStart = performance.now();
  JSON.parse(preflightRow);
  const preflightParseMs = performance.now() - preStart;

  return {
    universeSize,
    fullRowBytes: fullRow.length,
    preflightRowBytes: preflightRow.length,
    fullJobParseMs,
    preflightParseMs,
  };
}
