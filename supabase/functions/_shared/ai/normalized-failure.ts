/**
 * Normalized AI failure categories. Safe to log and return to clients.
 * Never include provider bodies, prompts, or credentials.
 */

export const AI_FAILURE_CATEGORIES = [
  "AUTH",
  "RATE_LIMIT",
  "TIMEOUT",
  "PROVIDER_5XX",
  "MALFORMED_RESPONSE",
  "SCHEMA_VALIDATION",
  "INSUFFICIENT_EVIDENCE",
  "STALE_INPUT",
  "COST_GUARD",
  "UNKNOWN",
] as const;

export type AiFailureCategory = (typeof AI_FAILURE_CATEGORIES)[number];

export function classifyHttpFailure(input: {
  httpStatus: number | null;
  timedOut?: boolean;
  malformed?: boolean;
  schemaInvalid?: boolean;
  /** Sanitized Anthropic `error.type` when available — never log raw provider bodies. */
  errorType?: string | null;
}): AiFailureCategory {
  if (input.malformed) return "MALFORMED_RESPONSE";
  if (input.schemaInvalid) return "SCHEMA_VALIDATION";
  if (input.timedOut || input.httpStatus === null) return "TIMEOUT";

  const errorType = input.errorType?.trim().toLowerCase() ?? "";
  if (errorType === "authentication_error" || errorType === "permission_error") {
    return "AUTH";
  }
  if (
    errorType === "not_found_error"
    || errorType === "invalid_request_error"
    || errorType === "request_too_large"
  ) {
    return "COST_GUARD";
  }

  const status = input.httpStatus;
  if (status === 401 || status === 403) return "AUTH";
  if (status === 402 || status === 404) return "COST_GUARD";
  if (status === 400) return "COST_GUARD";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "PROVIDER_5XX";
  if (status === 408) return "TIMEOUT";
  return "UNKNOWN";
}

export function isRetryableAiFailure(category: AiFailureCategory): boolean {
  return category === "TIMEOUT" || category === "RATE_LIMIT" || category === "PROVIDER_5XX";
}

export function logAiRequest(fields: {
  surface: string;
  provider: string;
  model: string;
  attempt: number;
  fallbackUsed: boolean;
  durationMs: number;
  outcome: string;
  schemaValid: boolean | null;
  evidenceSufficient: boolean | null;
  failureCategory: AiFailureCategory | null;
  requestId?: string | null;
  feature?: string | null;
  triggerType?: string | null;
  failureCode?: string | null;
  providerStatus?: number | null;
}): void {
  console.log(JSON.stringify({
    event: "ai_request",
    surface: fields.surface,
    provider: fields.provider,
    model: fields.model,
    attempt: fields.attempt,
    fallback_used: fields.fallbackUsed,
    duration_ms: fields.durationMs,
    outcome: fields.outcome,
    schema_valid: fields.schemaValid,
    evidence_sufficient: fields.evidenceSufficient,
    failure_category: fields.failureCategory,
    request_id: fields.requestId ?? null,
    feature: fields.feature ?? null,
    trigger_type: fields.triggerType ?? null,
    failure_code: fields.failureCode ?? null,
    provider_status: fields.providerStatus ?? null,
  }));
}
