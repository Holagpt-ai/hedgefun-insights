import {
  formatAnthropicHttpErrorLog,
  readAnthropicErrorDetail,
} from "./anthropic-error.ts";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type AnthropicMessagesOk = {
  ok: true;
  text: string;
  httpStatus: number;
  elapsed_ms: number;
  usage?: { input_tokens: number | null; output_tokens: number | null };
};

export type AnthropicMessagesErr = {
  ok: false;
  outcome: "provider_error" | "parse_error";
  httpStatus: number | null;
  errorType: string | null;
  errorMessage: string | null;
  elapsed_ms: number;
  network: boolean;
  emptyResponse: boolean;
};

export type AnthropicMessagesResult = AnthropicMessagesOk | AnthropicMessagesErr;

export async function postAnthropicMessages(args: {
  apiKey: string;
  model: string;
  maxTokens: number;
  user: string;
  system?: string;
  timeoutMs: number;
  stage: string;
  requestId?: string;
  fetchImpl?: FetchLike;
}): Promise<AnthropicMessagesResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: args.model,
    max_tokens: args.maxTokens,
    messages: [{ role: "user", content: args.user }],
  };
  if (args.system) body.system = args.system;

  let providerRes: Response;
  try {
    providerRes = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      ok: false,
      outcome: "provider_error",
      httpStatus: null,
      errorType: timedOut ? "timeout" : "network",
      errorMessage: null,
      elapsed_ms: Date.now() - started,
      network: !timedOut,
      emptyResponse: false,
    };
  }

  const elapsed_ms = Date.now() - started;
  if (!providerRes.ok) {
    const detail = await readAnthropicErrorDetail(providerRes);
    console.error(formatAnthropicHttpErrorLog({
      http_status: providerRes.status,
      anthropic_error_type: detail.type,
      elapsed_ms,
      stage: args.stage,
      request_id: args.requestId ?? null,
    }));
    if (detail.message) {
      console.error(JSON.stringify({
        event: "anthropic_http_error_message",
        stage: args.stage,
        request_id: args.requestId ?? null,
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
      network: false,
      emptyResponse: false,
    };
  }

  let providerJson: {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
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
      network: false,
      emptyResponse: false,
    };
  }

  const textBlock = providerJson?.content?.find?.((b) => b?.type === "text")
    ?? providerJson?.content?.[0];
  const text = typeof textBlock?.text === "string" ? textBlock.text.trim() : "";
  const usage = {
    input_tokens: typeof providerJson?.usage?.input_tokens === "number"
      ? providerJson.usage.input_tokens
      : null,
    output_tokens: typeof providerJson?.usage?.output_tokens === "number"
      ? providerJson.usage.output_tokens
      : null,
  };

  if (!text) {
    return {
      ok: false,
      outcome: "parse_error",
      httpStatus: providerRes.status,
      errorType: null,
      errorMessage: null,
      elapsed_ms,
      network: false,
      emptyResponse: true,
    };
  }

  return {
    ok: true,
    text,
    httpStatus: providerRes.status,
    elapsed_ms,
    usage,
  };
}
