import {
  postAnthropicMessages,
  type FetchLike,
} from "../_shared/ai/anthropic-messages.ts";
import { briefProviderAttemptTimeoutMs } from "../_shared/briefs/generator-execution-budget.ts";

export type { FetchLike };

export type ClaudeOk = {
  ok: true;
  text: string;
  httpStatus: number;
  elapsed_ms: number;
};

export type ClaudeErr = {
  ok: false;
  outcome: "provider_error" | "parse_error";
  httpStatus: number | null;
  errorType: string | null;
  errorMessage: string | null;
  elapsed_ms: number;
};

export async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  fetchImpl?: FetchLike;
  requestId?: string;
}): Promise<ClaudeOk | ClaudeErr> {
  const result = await postAnthropicMessages({
    apiKey: args.apiKey,
    model: args.model,
    maxTokens: args.maxTokens,
    user: args.user,
    system: args.system,
    timeoutMs: briefProviderAttemptTimeoutMs(),
    stage: "generate_daily_brief",
    requestId: args.requestId,
    fetchImpl: args.fetchImpl,
  });
  if (result.ok) {
    return {
      ok: true,
      text: result.text,
      httpStatus: result.httpStatus,
      elapsed_ms: result.elapsed_ms,
    };
  }
  return {
    ok: false,
    outcome: result.outcome,
    httpStatus: result.httpStatus,
    errorType: result.errorType,
    errorMessage: result.errorMessage,
    elapsed_ms: result.elapsed_ms,
  };
}
