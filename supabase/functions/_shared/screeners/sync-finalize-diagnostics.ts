export type FinalizeStage =
  | "preflight"
  | "load_job"
  | "baseline_drift"
  | "claim_finalize_lease"
  | "merge_selections"
  | "load_volume_baselines"
  | "load_names"
  | "build_rows"
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
