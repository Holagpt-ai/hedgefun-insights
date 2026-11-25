import {
  logFinalizeStageEnter,
  logFinalizeStageExit,
  shouldPersistFinalizeStageMarker,
  type FinalizeStage,
} from "./sync-finalize-diagnostics.ts";

export type FinalizeMarkerWriter = {
  noteFinalizeStage(params: {
    jobId: string;
    stage: FinalizeStage;
    nowMs: number;
  }): Promise<void>;
};

/** Durable marker only — no stage-enter console log. */
export async function persistFinalizeStageMarker(
  store: FinalizeMarkerWriter,
  jobId: string,
  stage: FinalizeStage,
  nowMs: number,
): Promise<void> {
  if (!shouldPersistFinalizeStageMarker(stage)) return;
  try {
    await store.noteFinalizeStage({ jobId, stage, nowMs });
  } catch {
    /* diagnostic only — never change publish outcome */
  }
}

/**
 * Log enter, run work, log exit, then persist a durable completion marker.
 * Does not persist if work throws.
 */
export async function finalizeStageEnterExitWithMarkerAfterWork<T>(
  input: {
    generationId: string;
    syncRunId: string;
    stage: FinalizeStage;
    wallNowMs: number;
    store: FinalizeMarkerWriter;
    exitDetail?: string | ((result: T) => string | undefined);
    work: () => T | Promise<T>;
  },
): Promise<T> {
  logFinalizeStageEnter({
    generationId: input.generationId,
    stage: input.stage,
    syncRunId: input.syncRunId,
    action: "finalize",
  });
  const result = await input.work();
  const detail = typeof input.exitDetail === "function"
    ? input.exitDetail(result)
    : input.exitDetail;
  logFinalizeStageExit({
    generationId: input.generationId,
    syncRunId: input.syncRunId,
    stage: input.stage,
    detail,
  });
  await persistFinalizeStageMarker(
    input.store,
    input.generationId,
    input.stage,
    input.wallNowMs,
  );
  return result;
}