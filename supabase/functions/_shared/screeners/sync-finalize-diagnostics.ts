export type FinalizeStage =
  | "preflight"
  | "load_job"
  | "baseline_drift"
  | "claim_finalize_lease"
  | "merge_selections"
  | "load_volume_baselines"
  | "load_names"
  | "build_rows"
  | "build_evidence"
  | "preserve_check"
  | "atomic_publish"
  | "complete_publish"
  | "response";

export type SanitizedFinalizeErrorCode =
  | "type_error"
  | "range_error"
  | "reference_error"
  | "syntax_error"
  | "uri_error"
  | "aggregate_error"
  | "internal_error"
  | "unclassified";

export type FinalizeErrorClassification = {
  stage: FinalizeStage;
  code: SanitizedFinalizeErrorCode;
};

const ERROR_NAME_TO_CODE: Record<string, SanitizedFinalizeErrorCode> = {
  typeerror: "type_error",
  rangeerror: "range_error",
  referenceerror: "reference_error",
  syntaxerror: "syntax_error",
  urierror: "uri_error",
  aggregateerror: "aggregate_error",
};

export function sanitizeErrorToCode(error: unknown): SanitizedFinalizeErrorCode {
  if (error instanceof Error) {
    const key = error.name.replace(/\s+/g, "").toLowerCase();
    return ERROR_NAME_TO_CODE[key] ?? "internal_error";
  }
  return "unclassified";
}

export function classifyFinalizeError(
  error: unknown,
  stage: FinalizeStage,
): FinalizeErrorClassification {
  return {
    stage,
    code: sanitizeErrorToCode(error),
  };
}

const FINALIZE_STAGE_MARKER_RE = /^finalize_stage:[a-z0-9_]{1,40}$/;

/**
 * PostgREST `or` filter for a single conditional marker write.
 * Matches null or an existing stage marker so real errors are never replaced.
 */
export const FINALIZE_STAGE_MARKER_WRITE_OR_FILTER =
  "continue_last_error.is.null,continue_last_error.like.finalize_stage:*";

/**
 * Durable DB markers are limited to kill-relevant boundaries so finalize does
 * not add a PostgREST round trip at every console stage enter.
 */
export const DURABLE_FINALIZE_STAGE_MARKERS: ReadonlySet<FinalizeStage> = new Set([
  "load_job",
  "claim_finalize_lease",
  "merge_selections",
  "build_rows",
  "build_evidence",
  "atomic_publish",
]);

/** Bounded job marker written before a finalize stage. Survives an isolate kill. */
export function formatFinalizeStageMarker(stage: FinalizeStage): string {
  return `finalize_stage:${stage}`;
}

export function isFinalizeStageMarker(value: string | null | undefined): boolean {
  return typeof value === "string" && FINALIZE_STAGE_MARKER_RE.test(value);
}

/** True when a marker write may replace the current continue_last_error value. */
export function continueLastErrorAllowsFinalizeStageMarker(
  value: string | null | undefined,
): boolean {
  return value == null || isFinalizeStageMarker(value);
}

export function shouldPersistFinalizeStageMarker(stage: FinalizeStage): boolean {
  return DURABLE_FINALIZE_STAGE_MARKERS.has(stage);
}

/**
 * Parent continue dispatch records `http_546` after the child isolate is killed.
 * Keep the last stage marker so the resource-limit row still names the boundary.
 */
export function mergePlatformKillWithFinalizeStage(
  dispatchError: string,
  existing: string | null | undefined,
): string {
  if (!dispatchError.startsWith("http_")) return dispatchError;
  if (!isFinalizeStageMarker(existing)) return dispatchError;
  const merged = `${dispatchError}:${existing}`;
  return merged.length <= 80 ? merged : dispatchError;
}

export function logFinalizeStageEnter(input: {
  generationId: string;
  stage: FinalizeStage;
  syncRunId?: string;
  action?: string;
}): void {
  try {
    console.log(
      `[sync-screener-data] staged_finalize_stage_enter generation_id=${input.generationId}` +
        (input.action ? ` action=${input.action}` : "") +
        (input.syncRunId ? ` sync_run_id=${input.syncRunId}` : "") +
        ` stage=${input.stage}`,
    );
  } catch {
    /* best-effort instrumentation */
  }
}

export function logFinalizeStageExit(input: {
  generationId: string;
  stage: FinalizeStage;
  syncRunId?: string;
  detail?: string;
}): void {
  try {
    console.log(
      `[sync-screener-data] staged_finalize_stage_exit generation_id=${input.generationId}` +
        (input.syncRunId ? ` sync_run_id=${input.syncRunId}` : "") +
        ` stage=${input.stage}` +
        (input.detail ? ` detail=${input.detail}` : ""),
    );
  } catch {
    /* best-effort instrumentation */
  }
}

export function logFinalizeStageTimings(input: {
  generationId: string;
  syncRunId?: string;
  timingsMs: Partial<Record<FinalizeStage, number>>;
}): void {
  try {
    console.log(
      `[sync-screener-data] staged_finalize_timing generation_id=${input.generationId}` +
        (input.syncRunId ? ` sync_run_id=${input.syncRunId}` : "") +
        ` ${JSON.stringify(input.timingsMs)}`,
    );
  } catch {
    /* best-effort instrumentation */
  }
}

export function logFinalizeFailure(input: {
  generationId: string;
  syncRunId?: string;
  classification: FinalizeErrorClassification;
}): void {
  try {
    console.error(
      `[sync-screener-data] staged_finalize_failed generation_id=${input.generationId}` +
        (input.syncRunId ? ` sync_run_id=${input.syncRunId}` : "") +
        ` stage=${input.classification.stage} code=${input.classification.code}`,
    );
  } catch {
    console.error(
      `[sync-screener-data] staged_finalize_failed generation_id=${input.generationId} code=log_failed`,
    );
  }
}

export function logUnhandledSyncError(error: unknown): void {
  try {
    const code = sanitizeErrorToCode(error);
    console.error(`[sync-screener-data] unhandled_error code=${code}`);
  } catch {
    console.error("[sync-screener-data] unhandled_error code=log_failed");
  }
}
