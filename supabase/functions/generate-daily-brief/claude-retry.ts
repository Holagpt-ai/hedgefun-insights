import { callClaude, type ClaudeErr, type ClaudeOk, type FetchLike } from "./claude.ts";
import { failureCodeFromCategory } from "../_shared/ai/failure-codes.ts";
import {
  classifyHttpFailure,
  isRetryableAiFailure,
  logAiRequest,
  type AiFailureCategory,
} from "../_shared/ai/normalized-failure.ts";
import {
  AI_MAX_TRANSPORT_ATTEMPTS,
  computeRetryDelayMs,
  shouldRetryTransportFailure,
} from "../_shared/ai/retry-policy.ts";

function failureCategory(err: ClaudeErr): AiFailureCategory {
  return classifyHttpFailure({
    httpStatus: err.httpStatus,
    timedOut: err.errorType === "timeout" || (err.httpStatus === null && err.outcome === "provider_error"),
    malformed: err.outcome === "parse_error",
  });
}

function isRetryable(err: ClaudeErr, attempt: number): boolean {
  return shouldRetryTransportFailure({
    httpStatus: err.httpStatus,
    timedOut: err.errorType === "timeout",
    network: err.errorType === "network",
    outcome: err.outcome,
    attempt,
    maxAttempts: AI_MAX_TRANSPORT_ATTEMPTS,
  });
}

function logAttempt(
  args: { model: string; requestId?: string },
  attempt: number,
  result: ClaudeOk | ClaudeErr,
  durationMs: number,
): void {
  const category = result.ok ? null : failureCategory(result);
  logAiRequest({
    surface: "generate_daily_brief",
    provider: "anthropic",
    model: args.model,
    attempt,
    fallbackUsed: false,
    durationMs,
    outcome: result.ok ? "generated" : result.outcome,
    schemaValid: result.ok ? true : result.outcome === "parse_error" ? false : null,
    evidenceSufficient: true,
    failureCategory: category,
    requestId: args.requestId,
    feature: "daily_brief",
    triggerType: "scheduled",
    failureCode: category
      ? failureCodeFromCategory(category, {
        network: !result.ok && result.errorType === "network",
        emptyResponse: !result.ok && result.outcome === "parse_error",
      })
      : null,
    providerStatus: result.ok ? result.httpStatus : result.httpStatus,
  });
}

/** Bounded retries for timeout, rate limit, and provider 5xx. No second provider. */
export async function callClaudeWithRetry(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  fetchImpl?: FetchLike;
  requestId?: string;
}): Promise<ClaudeOk | ClaudeErr> {
  const started = Date.now();
  const first = await callClaude(args);
  logAttempt(args, 1, first, Date.now() - started);
  if (first.ok || !isRetryable(first, 1)) return first;
  await new Promise((resolve) => setTimeout(resolve, computeRetryDelayMs(1)));
  const retriedAt = Date.now();
  const second = await callClaude(args);
  logAttempt(args, 2, second, Date.now() - retriedAt);
  return second;
}

export function briefProviderFailureBody(err: ClaudeErr): {
  status: number;
  body: {
    available: false;
    reason: "temporarily_unavailable" | "malformed_response";
    failure_category: AiFailureCategory;
    failure_code: ReturnType<typeof failureCodeFromCategory>;
    retryable: boolean;
  };
} {
  const category = failureCategory(err);
  return {
    status: 502,
    body: {
      available: false,
      reason: err.outcome === "parse_error" ? "malformed_response" : "temporarily_unavailable",
      failure_category: category,
      failure_code: failureCodeFromCategory(category, {
        network: err.errorType === "network",
        emptyResponse: err.outcome === "parse_error",
      }),
      retryable: isRetryableAiFailure(category),
    },
  };
}
