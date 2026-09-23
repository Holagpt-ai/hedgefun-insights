import { callClaude, type ClaudeErr, type ClaudeOk, type FetchLike } from "./claude.ts";

const RETRYABLE_STATUS = new Set([429, 502, 503, 529]);

function isRetryable(err: ClaudeErr): boolean {
  return err.httpStatus !== null && RETRYABLE_STATUS.has(err.httpStatus);
}

/** Single backoff retry for transient Anthropic failures (shared by AM/PM briefs). */
export async function callClaudeWithRetry(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  fetchImpl?: FetchLike;
}): Promise<ClaudeOk | ClaudeErr> {
  const first = await callClaude(args);
  if (first.ok || !isRetryable(first)) return first;
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  return await callClaude(args);
}
