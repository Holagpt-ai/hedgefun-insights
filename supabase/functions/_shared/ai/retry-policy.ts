import { classifyHttpFailure, isRetryableAiFailure, type AiFailureCategory } from "./normalized-failure.ts";

/** Max provider transport attempts (initial + retries). */
export const AI_MAX_TRANSPORT_ATTEMPTS = 2;

export const AI_RETRY_BASE_MS = 1_500;
export const AI_RETRY_MAX_MS = 8_000;
export const AI_RETRY_JITTER_MS = 250;

export function computeRetryDelayMs(attemptIndex: number): number {
  const exp = AI_RETRY_BASE_MS * Math.pow(2, Math.max(0, attemptIndex - 1));
  const jitter = Math.floor(Math.random() * AI_RETRY_JITTER_MS);
  return Math.min(exp + jitter, AI_RETRY_MAX_MS);
}

export function transportFailureCategory(input: {
  httpStatus: number | null;
  timedOut?: boolean;
  network?: boolean;
}): AiFailureCategory {
  return classifyHttpFailure({
    httpStatus: input.httpStatus,
    timedOut: input.timedOut === true || (input.network === true && input.httpStatus === null),
  });
}

export function shouldRetryTransportFailure(input: {
  httpStatus: number | null;
  timedOut?: boolean;
  network?: boolean;
  outcome: "provider_error" | "parse_error" | string;
  attempt: number;
  maxAttempts?: number;
}): boolean {
  const max = input.maxAttempts ?? AI_MAX_TRANSPORT_ATTEMPTS;
  if (input.attempt >= max) return false;
  if (input.outcome !== "provider_error") return false;
  if (input.httpStatus === 400 || input.httpStatus === 401 || input.httpStatus === 403) {
    return false;
  }
  const category = transportFailureCategory(input);
  return isRetryableAiFailure(category);
}
