/**
 * Machine-readable AI failure codes for clients and structured logs.
 * Never embed provider secrets, prompts, or raw bodies.
 */

import type { AiFailureCategory } from "./normalized-failure.ts";

export const AI_FAILURE_CODES = [
  "AI_AUTH_ERROR",
  "AI_ENTITLEMENT_ERROR",
  "AI_PROVIDER_AUTH_ERROR",
  "AI_RATE_LIMITED",
  "AI_PROVIDER_TIMEOUT",
  "AI_NETWORK_ERROR",
  "AI_PROVIDER_5XX",
  "AI_REQUEST_INVALID",
  "AI_CONTEXT_INVALID",
  "AI_CONTEXT_TOO_LARGE",
  "AI_EMPTY_RESPONSE",
  "AI_PARSE_ERROR",
  "AI_SCHEMA_VALIDATION_ERROR",
  "AI_PERSISTENCE_ERROR",
  "AI_STALE_CONTEXT",
  "AI_ABORTED",
  "AI_UNKNOWN_ERROR",
] as const;

export type AiFailureCode = (typeof AI_FAILURE_CODES)[number];

const CODE_SET = new Set<string>(AI_FAILURE_CODES);

export function isAiFailureCode(value: string): value is AiFailureCode {
  return CODE_SET.has(value);
}

export function failureCodeFromCategory(
  category: AiFailureCategory,
  hints?: { network?: boolean; emptyResponse?: boolean; persistence?: boolean },
): AiFailureCode {
  if (hints?.persistence) return "AI_PERSISTENCE_ERROR";
  if (hints?.emptyResponse) return "AI_EMPTY_RESPONSE";
  if (hints?.network && category === "TIMEOUT") return "AI_NETWORK_ERROR";
  switch (category) {
    case "AUTH":
      return "AI_PROVIDER_AUTH_ERROR";
    case "RATE_LIMIT":
      return "AI_RATE_LIMITED";
    case "TIMEOUT":
      return "AI_PROVIDER_TIMEOUT";
    case "PROVIDER_5XX":
      return "AI_PROVIDER_5XX";
    case "MALFORMED_RESPONSE":
      return hints?.emptyResponse ? "AI_EMPTY_RESPONSE" : "AI_PARSE_ERROR";
    case "SCHEMA_VALIDATION":
      return "AI_SCHEMA_VALIDATION_ERROR";
    case "INSUFFICIENT_EVIDENCE":
      return "AI_CONTEXT_INVALID";
    case "STALE_INPUT":
      return "AI_STALE_CONTEXT";
    case "COST_GUARD":
      return "AI_REQUEST_INVALID";
    default:
      return "AI_UNKNOWN_ERROR";
  }
}

/** Maps watchlist analyzer error_code strings onto shared AI codes where applicable. */
export function failureCodeFromWatchlistError(code: string | null | undefined): AiFailureCode | null {
  if (!code) return null;
  switch (code) {
    case "AI_AUTH":
      return "AI_PROVIDER_AUTH_ERROR";
    case "AI_RATE_LIMITED":
    case "RATE_LIMITED":
      return "AI_RATE_LIMITED";
    case "AI_TIMEOUT":
    case "PROVIDER_TIMEOUT":
      return "AI_PROVIDER_TIMEOUT";
    case "AI_PROVIDER_ERROR":
    case "PROVIDER_ERROR":
      return "AI_PROVIDER_5XX";
    case "AI_VALIDATION_FAILED":
      return "AI_SCHEMA_VALIDATION_ERROR";
    case "INSUFFICIENT_EVIDENCE":
      return "AI_CONTEXT_INVALID";
    default:
      return null;
  }
}
