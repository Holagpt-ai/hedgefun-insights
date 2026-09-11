// Isolated Qwen adapter. NOT imported by the Watchlist analyzer or provider
// factory. Kept only as a dormant future-migration sketch. Do not require
// QWEN_API_KEY / QWEN_BASE_URL in any deployed Watchlist config.

import { classifyFetchFailure } from "./market-data.ts";
import { LOG_PREFIX, sanitize } from "./sanitize.ts";
import type { WatchlistAiAdapter, WatchlistAiRawComplete, WatchlistAiUsage } from "./ai-provider.ts";

export const DORMANT_QWEN_MODEL = "qwen-flash-us";
export const DORMANT_QWEN_BASE_URL = "https://dashscope-us.aliyuncs.com/compatible-mode/v1";

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** Dormant helper. Factory createWatchlistAiAdapter must not call this. */
export function createDormantQwenAdapter(input: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): WatchlistAiAdapter {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = chatCompletionsUrl(input.baseUrl ?? DORMANT_QWEN_BASE_URL);
  const model = input.model ?? DORMANT_QWEN_MODEL;
  return {
    id: "qwen",
    model,
    async complete(prompt: string): Promise<WatchlistAiRawComplete> {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 512,
            temperature: 0,
            response_format: { type: "json_object" },
            enable_thinking: false,
          }),
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        console.warn(`${LOG_PREFIX} qwen transport error: ${sanitize(e)}`);
        return {
          kind: "transport_failure",
          code: "PROVIDER_TIMEOUT",
          http_status: null,
          failure_kind: classifyFetchFailure(e),
        };
      }
      if (res.status === 429) {
        try { await res.body?.cancel(); } catch { /* noop */ }
        return {
          kind: "transport_failure",
          code: "RATE_LIMITED",
          http_status: 429,
          failure_kind: "http_error",
        };
      }
      if (!res.ok) {
        try { await res.body?.cancel(); } catch { /* noop */ }
        return {
          kind: "transport_failure",
          code: "PROVIDER_ERROR",
          http_status: res.status,
          failure_kind: "http_error",
        };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return {
          kind: "transport_failure",
          code: "PROVIDER_ERROR",
          http_status: res.status,
          failure_kind: "invalid_json",
        };
      }
      const b = body as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      } | null;
      const rawText = b?.choices?.[0]?.message?.content;
      const usage: WatchlistAiUsage = {
        input_tokens: typeof b?.usage?.prompt_tokens === "number" ? b.usage.prompt_tokens : null,
        output_tokens: typeof b?.usage?.completion_tokens === "number" ? b.usage.completion_tokens : null,
      };
      if (typeof rawText !== "string") {
        return { kind: "ok", rawText: "", usage, http_status: res.status };
      }
      return { kind: "ok", rawText, usage, http_status: res.status };
    },
  };
}
