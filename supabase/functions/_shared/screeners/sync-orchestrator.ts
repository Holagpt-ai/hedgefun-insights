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
  /** NHL baselines for chunk evidence; empty until finalize loader runs in handler. */
  nhlBaselines: ReadonlyMap<string, NhlBaselineQuote>;
  policyExclusions: PolicyExclusionEvidence;
  scheduleContinue: (body: StagedSyncRequest) => void;
};

export async function runStagedSyncStep(
  request: StagedSyncRequest,
  startJob: Omit<
    StagedGenerationJob,
    "id" | "leaseToken" | "leaseExpiresMs" | "createdAtMs" | "updatedAtMs"
  > | null,
  deps: StagedOrchestratorDeps,
): Promise<StagedStepResult> {
  const nowMs = deps.nowMs();
  await deps.store.abortExpired(nowMs);

  if (request.action === "continue") {
    const job = await deps.store.get(request.generation_id);
    if (!job || job.status === "aborted" || job.status === "published") {
      return { phase: "skipped", reason: "generation_not_active" };
    }
    if (job.nextChunkIndex >= job.totalChunks) {
      job.status = "finalizing";
      await deps.store.save(job);
      return { phase: "finalizing", generation_id: job.id };
    }
    return processNextChunk(job, deps);
  }

  if (request.action === "finalize") {
    const job = await deps.store.get(request.generation_id);
    if (!job || job.status === "aborted" || job.status === "published") {
      return { phase: "skipped", reason: "generation_not_active" };
    }
    job.status = "finalizing";
    await deps.store.save(job);
    return { phase: "finalizing", generation_id: job.id };
  }

  if (!startJob) {
    return { phase: "skipped", reason: "missing_job_input" };
  }
  const lease = deps.newLeaseToken();
  const acquired = await deps.store.acquireOrCreate(startJob, lease, nowMs);
  if (!acquired.ok) {
    return { phase: "skipped", reason: acquired.reason };
  }
  return processNextChunk(acquired.job, deps);
}

async function processNextChunk(
  job: StagedGenerationJob,
  deps: StagedOrchestratorDeps,
): Promise<StagedStepResult> {
  const idx = job.nextChunkIndex;
  if (idx >= job.totalChunks) {
    job.status = "finalizing";
    await deps.store.save(job);
    deps.scheduleContinue({ action: "finalize", generation_id: job.id });
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
  foldChunkIntoMerged(job.merged, chunk);
  job.nextChunkIndex = idx + 1;
  job.status = "chunking";
  await deps.store.save(job);

  const continueNext = job.nextChunkIndex < job.totalChunks;
  if (continueNext) {
    deps.scheduleContinue({ action: "continue", generation_id: job.id });
  } else {
    deps.scheduleContinue({ action: "finalize", generation_id: job.id });
  }
  return {
    phase: "chunk_processed",
    generation_id: job.id,
    chunk_index: idx,
    total_chunks: job.totalChunks,
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
  "id" | "leaseToken" | "leaseExpiresMs" | "createdAtMs" | "updatedAtMs"
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
  await store.save(job);
  while (job.nextChunkIndex < job.totalChunks) {
    const step = await runStagedSyncStep(
      { action: "continue", generation_id: job.id },
      null,
      orchestratorDeps,
    );
    if (step.phase === "skipped") throw new Error(step.reason);
    const refreshed = await store.get(job.id);
    if (!refreshed) throw new Error("job_lost");
    Object.assign(job, refreshed);
  }
  return job;
}
