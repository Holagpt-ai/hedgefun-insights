/**
 * Reader-facing brief states. A missing brief is not AI output.
 * Source failures stay insufficient evidence. Provider failures stay unavailable.
 */

export const INSUFFICIENT_BRIEF_REASONS = new Set([
  "source_stale",
  "source_unavailable",
  "source_missing_symbol",
  "source_invalid_price",
  "source_invalid_change",
  "source_missing_updated_at",
  "insufficient_evidence",
]);

export type BriefAccessState = "unauth" | "upgrade" | "temporarily_unavailable";

export function briefAccessState(httpStatus: number): BriefAccessState | null {
  if (httpStatus === 401) return "unauth";
  if (httpStatus === 403) return "upgrade";
  if (httpStatus >= 500) return "temporarily_unavailable";
  return null;
}

export function isInsufficientBriefReason(reason: string | null | undefined): boolean {
  return typeof reason === "string" && INSUFFICIENT_BRIEF_REASONS.has(reason);
}

export function presentStoredBriefFailure(input: {
  reason: string | null | undefined;
  generationStatus?: string | null;
  retryable?: boolean | null;
}): {
  statusLabel: "Insufficient evidence" | "Temporarily unavailable";
  message: string;
  refreshable: boolean;
  retryControl: boolean;
} | null {
  const status = input.generationStatus ?? "";
  const reason = input.reason ?? "";
  if (status === "insufficient_evidence" || isInsufficientBriefReason(reason)) {
    return {
      statusLabel: "Insufficient evidence",
      message: "Insufficient evidence. No brief is generated until the existing source checks pass.",
      refreshable: true,
      retryControl: false,
    };
  }
  if (status === "temporarily_unavailable" || reason === "temporarily_unavailable" || reason === "malformed_response") {
    const retryable = input.retryable === true;
    return {
      statusLabel: "Temporarily unavailable",
      message: "Temporarily unavailable",
      refreshable: retryable,
      retryControl: retryable,
    };
  }
  return null;
}
