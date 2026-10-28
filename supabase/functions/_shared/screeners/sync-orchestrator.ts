/**
 * Staged sync-screener-data orchestration (Architecture A).
 * One Edge invocation processes at most one universe chunk, then optionally
 * self-continues via SYNC_SECRET Bearer (separate CPU budget).
 */

import type { PolicyExclusionEvidence } from "./baseline-coverage.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import type { HistoricalCoverageEvidence } from "./evaluation-evidence.ts";
import type { NhlBaselineQuote } from "./new-highs-lows.ts";
import { isExtendedSyncSession, resolveSyncSessionKind } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { createSessionVolumeCache } from "./session-volume.ts";
import { foldChunkIntoMerged, processUniverseChunk } from "./sync-chunk-processor.ts";
import type { MemorySyncStagingStore, SyncStagingStore } from "./sync-staging-memory.ts";
import {
  emptyChunkArtifacts,
  SCREENER_SYNC_CHUNK_SIZE,
  type StagedGenerationJob,
  type StagedSyncRequest,
} from "./sync-staging-types.ts";

export type StagedStepResult =
  | {
    phase: "chunk_processed";
    generation_id: string;
    chunk_index: number;
    total_chunks: number;
    continue: boolean;
  }
  | { phase: "finalizing"; generation_id: string }
  | { phase: "published"; generation_id: string; sync_run_id: string }
  | { phase: "skipped"; reason: string };

export type StagedOrchestratorDeps = {
  nowMs: () => number;
  newLeaseToken: () => string;
  store: SyncStagingStore;
  nhlBaselines: ReadonlyMap<string, NhlBaselineQuote>;
  policyExclusions: PolicyExclusionEvidence;
  scheduleContinue: (body: StagedSyncRequest) => void;
};

export async function runStagedSyncStep(
  request: StagedSyncRequest,
  startJob: Omit<
    StagedGenerationJob,
    | "id"
    | "leaseToken"
    | "leaseExpiresMs"
    | "createdAtMs"
    | "updatedAtMs"
    | "stateVersion"
    | "continueLastAtMs"
    | "continueLastError"
    | "finalizeLeaseToken"
    | "finalizeLeaseExpiresMs"
  > | null,
  deps: StagedOrchestratorDeps,
): Promise<StagedStepResult> {
  const nowMs = deps.nowMs();
  await deps.store.abortExpired(nowMs);

  if (request.action === "continue") {
    const leaseToken = deps.newLeaseToken();
    const peek = await deps.store.get(request.generation_id);
    if (!peek || peek.status === "aborted" || peek.status === "published" ||
      peek.status === "failed") {
      return { phase: "skipped", reason: "generation_not_active" };
    }
    const mode = peek.nextChunkIndex >= peek.totalChunks ? "finalize" : "chunk";
    const claimed = await deps.store.claimWork({
      jobId: request.generation_id,
      leaseToken,
      nowMs,
      mode,
    });
    if (!claimed.ok) {
      return { phase: "skipped", reason: claimed.reason };
    }
    if (mode === "finalize") {
      return { phase: "finalizing", generation_id: claimed.job.id };
    }
    return processNextChunk(claimed.job, deps, leaseToken);
  }

  if (request.action === "finalize") {
    const leaseToken = deps.newLeaseToken();
    const claimed = await deps.store.claimWork({
      jobId: request.generation_id,
      leaseToken,
      nowMs,
      mode: "finalize",
    });
    if (!claimed.ok) {
      return { phase: "skipped", reason: claimed.reason };
    }
    return { phase: "finalizing", generation_id: claimed.job.id };
  }

  if (!startJob) {
    return { phase: "skipped", reason: "missing_job_input" };
  }
  const lease = deps.newLeaseToken();
  const acquired = await deps.store.acquireOrCreate(startJob, lease, nowMs);
  if (!acquired.ok) {
    return { phase: "skipped", reason: acquired.reason };
  }
  return processNextChunk(acquired.job, deps, lease);
}

async function processNextChunk(
  job: StagedGenerationJob,
  deps: StagedOrchestratorDeps,
  leaseToken: string,
): Promise<StagedStepResult> {
  const nowMs = deps.nowMs();
  const idx = job.nextChunkIndex;
  const version = job.stateVersion;
  if (idx >= job.totalChunks) {
    return { phase: "finalizing", generation_id: job.id };
  }
  const start = idx * job.chunkSize;
  const slice = job.allTickers.slice(start, start + job.chunkSize);
  const { observation } = job;
  const cache = createSessionVolumeCache({
    nowMs: observation.nowMs,
    observationSessionVolume: observation.observationSessionFields,
    extendedSession: observation.extendedSession,
  });
  const coverage: HistoricalCoverageEvidence = {
    baselineSymbols: new Set(deps.nhlBaselines.keys()),
    policyExclusions: deps.policyExclusions,
  };
  const chunk = processUniverseChunk(slice, {
    extendedSession: observation.extendedSession,
    observationSessionFields: observation.observationSessionFields,
    nowMs: observation.nowMs,
    sessionVolumeCache: cache,
    syncSessionKind: observation.sessionKind,
    coverage,
    nhlBaselines: deps.nhlBaselines,
    policyExclusions: deps.policyExclusions,
  });
  const merged = structuredClone(job.merged);
  foldChunkIntoMerged(merged, chunk);

  const advanced = await deps.store.advanceChunk({
    jobId: job.id,
    leaseToken,
    expectedChunkIndex: idx,
    expectedStateVersion: version,
    merged,
    nowMs,
  });
  if (!advanced.ok) {
    return { phase: "skipped", reason: advanced.reason };
  }
  const refreshed = advanced.job;

  const continueNext = refreshed.nextChunkIndex < refreshed.totalChunks;
  if (continueNext) {
    deps.scheduleContinue({ action: "continue", generation_id: refreshed.id });
  } else {
    deps.scheduleContinue({ action: "finalize", generation_id: refreshed.id });
  }
  return {
    phase: "chunk_processed",
    generation_id: refreshed.id,
    chunk_index: idx,
    total_chunks: refreshed.totalChunks,
    continue: continueNext,
  };
}

export function buildStagedJobFromUniverse(
  allTickers: import("./selection.ts").PolygonTicker[],
  gainers: import("./selection.ts").PolygonTicker[],
  losers: import("./selection.ts").PolygonTicker[],
  nowMs: number,
  syncedAt: string,
  syncRunId: string,
  chunkSize: number = SCREENER_SYNC_CHUNK_SIZE,
): Omit<
  StagedGenerationJob,
  | "id"
  | "leaseToken"
  | "leaseExpiresMs"
  | "createdAtMs"
  | "updatedAtMs"
  | "stateVersion"
  | "continueLastAtMs"
  | "continueLastError"
  | "finalizeLeaseToken"
  | "finalizeLeaseExpiresMs"
> {
  const sessionKind = resolveSyncSessionKind(nowMs);
  const totalChunks = Math.max(1, Math.ceil(allTickers.length / chunkSize));
  return {
    status: "chunking",
    observation: {
      nowMs,
      sessionKind,
      extendedSession: isExtendedSyncSession(sessionKind),
      observationSessionFields: isLiveSurveillanceSessionKind(sessionKind),
      syncedAt,
      syncRunId,
    },
    allTickers,
    gainers,
    losers,
    chunkSize,
    nextChunkIndex: 0,
    totalChunks,
    merged: emptyChunkArtifacts(),
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
  };
}

/** Test helper: run all chunks synchronously in-process. */
export async function runAllChunksInProcess(
  job: StagedGenerationJob,
  store: MemorySyncStagingStore,
  deps: Omit<StagedOrchestratorDeps, "store" | "scheduleContinue">,
): Promise<StagedGenerationJob> {
  const orchestratorDeps: StagedOrchestratorDeps = {
    ...deps,
    store,
    scheduleContinue: () => {},
  };
  store.seedJob({
    ...job,
    leaseToken: null,
    leaseExpiresMs: null,
    finalizeLeaseToken: null,
    finalizeLeaseExpiresMs: null,
  });
  const running = { ...job };
  while (running.nextChunkIndex < running.totalChunks) {
    const step = await runStagedSyncStep(
      { action: "continue", generation_id: running.id },
      null,
      orchestratorDeps,
    );
    if (step.phase === "skipped") throw new Error(step.reason);
    const refreshed = await store.get(running.id);
    if (!refreshed) throw new Error("job_lost");
    Object.assign(running, refreshed);
  }
  return running;
}
