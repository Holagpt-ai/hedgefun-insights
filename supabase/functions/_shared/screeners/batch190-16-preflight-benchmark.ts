import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import {
  createFrozenNhlBaselineSnapshot,
  serializeNhlBaselineSnapshotForStorage,
} from "./nhl-baseline-snapshot.ts";
import {
  jobInsertRowJsonRoundTrip,
  jobToPreflightView,
} from "./sync-staging-serialize.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import {
  buildRepresentativeNhlBaselines,
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";

/**
 * Baseline quote density tuned so serialized `nhl_baseline_snapshot` is ~291 KB
 * (Nov 5 production observed ~291 KB at ~13k universe; e2e cadence 26 is ~42 KB).
 */
export const PRODUCTION_NHL_BASELINE_COVERAGE_EVERY = 4;

export type Batch19016PayloadSample = {
  universeSize: number;
  fullRowBytes: number;
  preflightRowBytes: number;
  nhlBaselineSnapshotBytes: number;
  fullJobParseMs: number;
  preflightParseMs: number;
};

export function buildProductionScaleFrozenNhlBaselineSnapshot(
  universeSize: number = REPRESENTATIVE_UNIVERSE_SIZE,
  nowMs: number = Date.parse("2026-11-05T20:00:00.000Z"),
) {
  const universe = buildRepresentativeUniverse(universeSize, "regular", nowMs);
  const nhlBaselines = buildRepresentativeNhlBaselines(
    universe,
    PRODUCTION_NHL_BASELINE_COVERAGE_EVERY,
  );
  return createFrozenNhlBaselineSnapshot({
    baselineGenerationId: "batch190-16-representative-nhl",
    status: "available",
    declaredSymbolCount: nhlBaselines.size,
    quotes: nhlBaselines,
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    frozenAtMs: nowMs,
  });
}

/** Local JSON size / parse timing — not hosted Edge CPU. */
export function runBatch19016PreflightPayloadBenchmark(
  universeSize: number,
): Batch19016PayloadSample {
  const nowMs = Date.parse("2026-11-05T20:00:00.000Z");
  const universe = buildRepresentativeUniverse(universeSize, "regular", nowMs);
  const nhlBaselineSnapshot = buildProductionScaleFrozenNhlBaselineSnapshot(
    universeSize,
    nowMs,
  );
  const nhlBaselineSnapshotBytes = JSON.stringify(
    serializeNhlBaselineSnapshotForStorage(nhlBaselineSnapshot),
  ).length;

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
    nhlBaselineSnapshot,
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
    nhlBaselineSnapshotBytes,
    fullJobParseMs,
    preflightParseMs,
  };
}
