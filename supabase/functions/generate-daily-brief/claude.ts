import { readAnthropicErrorType } from "../_shared/ai/anthropic-error.ts";

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
    });
  } catch {
    return {
      ok: false,
      outcome: "provider_error",
      httpStatus: null,
      errorType: null,
      elapsed_ms: Date.now() - started,
    };
  }
  const elapsed_ms = Date.now() - started;
  if (!providerRes.ok) {
    const errorType = await readAnthropicErrorType(providerRes);
    return {
      ok: false,
      outcome: "provider_error",
      httpStatus: providerRes.status,
      errorType,
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
      elapsed_ms,
    };
  }
  return { ok: true, text: briefContent, httpStatus: providerRes.status, elapsed_ms };
}
