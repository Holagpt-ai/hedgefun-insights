import { callClaude, type ClaudeErr, type ClaudeOk, type FetchLike } from "./claude.ts";
import {
  classifyHttpFailure,
  isRetryableAiFailure,
  logAiRequest,
  type AiFailureCategory,
} from "../_shared/ai/normalized-failure.ts";

function failureCategory(err: ClaudeErr): AiFailureCategory {
  return classifyHttpFailure({
    httpStatus: err.httpStatus,
    timedOut: err.errorType === "timeout" || (err.httpStatus === null && err.outcome === "provider_error"),
    malformed: err.outcome === "parse_error",
  });
}

function isRetryable(err: ClaudeErr): boolean {
  if (err.outcome !== "provider_error") return false;
  if (err.httpStatus === 401 || err.httpStatus === 403 || err.httpStatus === 400) return false;
  return isRetryableAiFailure(failureCategory(err));
}

function logAttempt(
  args: { model: string },
  attempt: number,
  result: ClaudeOk | ClaudeErr,
  durationMs: number,
): void {
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
    failureCategory: result.ok ? null : failureCategory(result),
  });
}

/** One bounded retry for timeout, rate limit, and provider 5xx. No second provider. */
export async function callClaudeWithRetry(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  fetchImpl?: FetchLike;
  sleepMs?: number;
}): Promise<ClaudeOk | ClaudeErr> {
  const started = Date.now();
  const first = await callClaude(args);
  logAttempt(args, 1, first, Date.now() - started);
  if (first.ok || !isRetryable(first)) return first;
  await new Promise((resolve) => setTimeout(resolve, args.sleepMs ?? 1_500));
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
      retryable: isRetryableAiFailure(category),
    },
  };
}
