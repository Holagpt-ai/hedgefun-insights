import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveApprovedWatchlistFallback } from "./ai-fallback.ts";

Deno.test("fallback stays off when the flag is off even if a second key exists", () => {
  const adapter = resolveApprovedWatchlistFallback({
    WATCHLIST_AI_FALLBACK: "off",
    QWEN_API_KEY: "present",
  });
  assertEquals(adapter, null);
});

Deno.test("fallback is constructed only when the flag is on and a key exists", () => {
  assertEquals(resolveApprovedWatchlistFallback({ WATCHLIST_AI_FALLBACK: "on" }), null);
  const adapter = resolveApprovedWatchlistFallback({
    WATCHLIST_AI_FALLBACK: "on",
    QWEN_API_KEY: "present",
  });
  assertEquals(adapter?.id, "qwen");
});
