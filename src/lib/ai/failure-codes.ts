/** Client-safe AI failure codes returned by edge functions (no secrets). */

export type AiFailureCode =
  | "AI_AUTH_ERROR"
  | "AI_ENTITLEMENT_ERROR"
  | "AI_PROVIDER_AUTH_ERROR"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_NETWORK_ERROR"
  | "AI_PROVIDER_5XX"
  | "AI_REQUEST_INVALID"
  | "AI_CONTEXT_INVALID"
  | "AI_CONTEXT_TOO_LARGE"
  | "AI_EMPTY_RESPONSE"
  | "AI_PARSE_ERROR"
  | "AI_SCHEMA_VALIDATION_ERROR"
  | "AI_PERSISTENCE_ERROR"
  | "AI_STALE_CONTEXT"
  | "AI_ABORTED"
  | "AI_UNKNOWN_ERROR";

export type BriefGenerationStatus =
  | "generating"
  | "ready"
  | "insufficient_evidence"
  | "temporarily_unavailable";

export function isRetryableFailureCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code === "AI_RATE_LIMITED"
    || code === "AI_PROVIDER_TIMEOUT"
    || code === "AI_NETWORK_ERROR"
    || code === "AI_PROVIDER_5XX";
}
