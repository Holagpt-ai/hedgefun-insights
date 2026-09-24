import {
  formatAnthropicHttpErrorLog,
  readAnthropicErrorDetail,
} from "../_shared/ai/anthropic-error.ts";

const ANTHROPIC_TIMEOUT_MS = 50_000;

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

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
}): Promise<ClaudeOk | ClaudeErr> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const started = Date.now();
  let providerRes: Response;
  try {
    providerRes = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      outcome: "provider_error",
      httpStatus: null,
      errorType: null,
      errorMessage: null,
      elapsed_ms: Date.now() - started,
    };
  }
  const elapsed_ms = Date.now() - started;
  if (!providerRes.ok) {
    const detail = await readAnthropicErrorDetail(providerRes);
    console.error(formatAnthropicHttpErrorLog({
      http_status: providerRes.status,
      anthropic_error_type: detail.type,
      elapsed_ms,
      stage: "generate_daily_brief",
    }));
    if (detail.message) {
      console.error(JSON.stringify({
        event: "anthropic_http_error_message",
        stage: "generate_daily_brief",
        message: detail.message,
      }));
    }
    return {
      ok: false,
      outcome: "provider_error",
      httpStatus: providerRes.status,
      errorType: detail.type,
      errorMessage: detail.message,
      elapsed_ms,
    };
  }
  let providerJson: { content?: Array<{ type?: string; text?: string }> };
  try {
    providerJson = await providerRes.json();
  } catch {
    return {
      ok: false,
      outcome: "parse_error",
      httpStatus: providerRes.status,
      errorType: null,
      errorMessage: null,
      elapsed_ms,
    };
  }
  const textBlock = providerJson?.content?.find?.((b) => b?.type === "text");
  const briefContent = typeof textBlock?.text === "string" ? textBlock.text.trim() : "";
  if (!briefContent) {
    return {
      ok: false,
      outcome: "parse_error",
      httpStatus: providerRes.status,
      errorType: null,
      errorMessage: null,
      elapsed_ms,
    };
  }
  return { ok: true, text: briefContent, httpStatus: providerRes.status, elapsed_ms };
}
