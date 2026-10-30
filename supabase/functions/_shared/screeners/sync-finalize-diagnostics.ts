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

export type FinalizeErrorClassification = {
  stage: FinalizeStage;
  code: string;
  detail: string;
};

const MAX_DETAIL = 160;

function truncateDetail(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_DETAIL) return trimmed;
  return `${trimmed.slice(0, MAX_DETAIL - 3)}...`;
}

export function classifyFinalizeError(
  error: unknown,
  stage: FinalizeStage,
): FinalizeErrorClassification {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? error.name : "Error";
    return {
      stage,
      code: `exception_${name.toLowerCase()}`,
      detail: truncateDetail(error.message),
    };
  }
  return {
    stage,
    code: "exception_unknown",
    detail: truncateDetail(String(error)),
  };
}

export function logFinalizeFailure(input: {
  generationId: string;
  syncRunId?: string;
  classification: FinalizeErrorClassification;
}): void {
  console.error(
    `[sync-screener-data] staged_finalize_failed generation_id=${input.generationId}` +
      (input.syncRunId ? ` sync_run_id=${input.syncRunId}` : "") +
      ` stage=${input.classification.stage} code=${input.classification.code}` +
      ` detail=${JSON.stringify(input.classification.detail)}`,
  );
}

export function logUnhandledSyncError(error: unknown): void {
  const classification = classifyFinalizeError(error, "preflight");
  console.error(
    `[sync-screener-data] unhandled_error code=${classification.code}` +
      ` detail=${JSON.stringify(classification.detail)}`,
  );
}
