import {
  AI_FAILURE_CATEGORIES,
  classifyHttpFailure,
  isRetryableAiFailure,
  type AiFailureCategory,
} from "../ai/normalized-failure.ts";

export type BriefKind = "am" | "pm";
export type BriefGenerationStatus = "insufficient_evidence" | "temporarily_unavailable";

export interface BriefGenerationState {
  brief_type: BriefKind;
  brief_date: string;
  status: BriefGenerationStatus;
  failure_category: AiFailureCategory;
  retryable: boolean;
  failed_at: string;
  updated_at: string;
}

const CATEGORY_SET = new Set<string>(AI_FAILURE_CATEGORIES);

export function stateFromProviderFailure(input: {
  briefType: BriefKind;
  briefDate: string;
  httpStatus: number | null;
  outcome: "provider_error" | "parse_error";
  errorType: string | null;
  failedAt: string;
}): BriefGenerationState {
  const failure_category = classifyHttpFailure({
    httpStatus: input.httpStatus,
    timedOut: input.errorType === "timeout" || (input.httpStatus === null && input.outcome === "provider_error"),
    malformed: input.outcome === "parse_error",
  });
  const retryable = input.outcome === "provider_error"
    && input.httpStatus !== 400
    && input.httpStatus !== 401
    && input.httpStatus !== 403
    && isRetryableAiFailure(failure_category);
  return {
    brief_type: input.briefType,
    brief_date: input.briefDate,
    status: "temporarily_unavailable",
    failure_category,
    retryable,
    failed_at: input.failedAt,
    updated_at: input.failedAt,
  };
}

export function stateFromPersistFailure(input: {
  briefType: BriefKind;
  briefDate: string;
  failedAt: string;
}): BriefGenerationState {
  return {
    brief_type: input.briefType,
    brief_date: input.briefDate,
    status: "temporarily_unavailable",
    failure_category: "UNKNOWN",
    retryable: true,
    failed_at: input.failedAt,
    updated_at: input.failedAt,
  };
}

export function stateFromEvidenceReason(input: {
  briefType: BriefKind;
  briefDate: string;
  reason: string;
  failedAt: string;
}): BriefGenerationState {
  const stale = input.reason === "source_stale";
  return {
    brief_type: input.briefType,
    brief_date: input.briefDate,
    status: "insufficient_evidence",
    failure_category: stale ? "STALE_INPUT" : "INSUFFICIENT_EVIDENCE",
    retryable: false,
    failed_at: input.failedAt,
    updated_at: input.failedAt,
  };
}

/** Columns that may be written. Provider text is not a field. */
export function publicGenerationState(row: BriefGenerationState): BriefGenerationState {
  return {
    brief_type: row.brief_type === "pm" ? "pm" : "am",
    brief_date: row.brief_date,
    status: row.status,
    failure_category: row.failure_category,
    retryable: row.retryable === true,
    failed_at: row.failed_at,
    updated_at: row.updated_at,
  };
}

export function parseGenerationState(raw: unknown): BriefGenerationState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.brief_type !== "am" && row.brief_type !== "pm") return null;
  if (typeof row.brief_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.brief_date)) return null;
  if (row.status !== "insufficient_evidence" && row.status !== "temporarily_unavailable") return null;
  if (typeof row.failure_category !== "string" || !CATEGORY_SET.has(row.failure_category)) return null;
  if (typeof row.retryable !== "boolean") return null;
  if (typeof row.failed_at !== "string" || !Number.isFinite(Date.parse(row.failed_at))) return null;
  const updated = typeof row.updated_at === "string" && Number.isFinite(Date.parse(row.updated_at))
    ? row.updated_at
    : row.failed_at;
  return {
    brief_type: row.brief_type,
    brief_date: row.brief_date,
    status: row.status,
    failure_category: row.failure_category as AiFailureCategory,
    retryable: row.retryable,
    failed_at: row.failed_at,
    updated_at: updated,
  };
}

export type BriefRead =
  | { generation_status: "ready" }
  | { generation_status: "generating" }
  | {
    generation_status: "insufficient_evidence";
    reason: "insufficient_evidence";
    failure_category: AiFailureCategory;
    retryable: false;
    failed_at: string;
  }
  | {
    generation_status: "temporarily_unavailable";
    reason: "temporarily_unavailable";
    failure_category: AiFailureCategory;
    retryable: boolean;
    failed_at: string;
  };

/** A valid brief wins. A stored failure replaces an endless generating state. */
export function resolveBriefRead(input: {
  hasValidBrief: boolean;
  state: BriefGenerationState | null;
}): BriefRead {
  if (input.hasValidBrief) return { generation_status: "ready" };
  const state = input.state;
  if (!state) return { generation_status: "generating" };
  if (state.status === "insufficient_evidence") {
    return {
      generation_status: "insufficient_evidence",
      reason: "insufficient_evidence",
      failure_category: state.failure_category,
      retryable: false,
      failed_at: state.failed_at,
    };
  }
  return {
    generation_status: "temporarily_unavailable",
    reason: "temporarily_unavailable",
    failure_category: state.failure_category,
    retryable: state.retryable,
    failed_at: state.failed_at,
  };
}

type StateWriter = {
  from(table: string): {
    upsert(
      row: BriefGenerationState,
      options: { onConflict: string },
    ): PromiseLike<{ error: { code?: string } | null }>;
    delete(): {
      eq(column: string, value: string): {
        eq(column: string, value: string): PromiseLike<{ error: { code?: string } | null }>;
      };
    };
  };
};

export async function writeBriefGenerationState(
  admin: StateWriter,
  row: BriefGenerationState,
): Promise<void> {
  const safe = publicGenerationState(row);
  const { error } = await admin.from("daily_brief_generation_state").upsert(safe, {
    onConflict: "brief_type,brief_date",
  });
  if (error) {
    console.error(JSON.stringify({
      event: "brief_generation_state_write_failed",
      code: error.code ?? "unknown",
    }));
  }
}

export async function clearBriefGenerationState(
  admin: StateWriter,
  briefType: BriefKind,
  briefDate: string,
): Promise<void> {
  const { error } = await admin
    .from("daily_brief_generation_state")
    .delete()
    .eq("brief_type", briefType)
    .eq("brief_date", briefDate);
  if (error) {
    console.error(JSON.stringify({
      event: "brief_generation_state_clear_failed",
      code: error.code ?? "unknown",
    }));
  }
}
