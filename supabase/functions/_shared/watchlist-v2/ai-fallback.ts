// Isolated approved fallback. The provider factory does not import this module.
// Fallback runs only when WATCHLIST_AI_FALLBACK=on and a key is present.

import { createDormantQwenAdapter } from "./ai-provider-qwen.ts";
import type { WatchlistAiAdapter } from "./ai-provider.ts";

export function resolveApprovedWatchlistFallback(
  env: Record<string, string | undefined>,
): WatchlistAiAdapter | null {
  const enabled = (env.WATCHLIST_AI_FALLBACK ?? "off").trim().toLowerCase() === "on";
  const apiKey = env.QWEN_API_KEY?.trim() ?? "";
  if (!enabled || !apiKey) return null;
  return createDormantQwenAdapter({
    apiKey,
    model: env.QWEN_MODEL?.trim() || undefined,
    baseUrl: env.QWEN_BASE_URL?.trim() || undefined,
  });
}

export function resolveApprovedWatchlistFallbackFromEnv(): WatchlistAiAdapter | null {
  return resolveApprovedWatchlistFallback({
    WATCHLIST_AI_FALLBACK: Deno.env.get("WATCHLIST_AI_FALLBACK"),
    QWEN_API_KEY: Deno.env.get("QWEN_API_KEY"),
    QWEN_BASE_URL: Deno.env.get("QWEN_BASE_URL"),
    QWEN_MODEL: Deno.env.get("QWEN_MODEL"),
  });
}
