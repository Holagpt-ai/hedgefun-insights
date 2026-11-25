import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_ANTHROPIC_HAIKU_MODEL,
  isPermanentAnthropicHttpFailure,
  resolveDailyBriefAnthropicModelId,
  resolveWatchlistAnthropicModelId,
  sanitizeAnthropicModelId,
} from "./anthropic-config.ts";

Deno.test("resolveWatchlistAnthropicModelId: WATCHLIST_AI_MODEL then ANTHROPIC_MODEL", () => {
  assertEquals(
    resolveWatchlistAnthropicModelId({
      WATCHLIST_AI_MODEL: "claude-haiku-4-5",
      ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
      DAILY_BRIEF_MODEL: "claude-haiku-3",
    }),
    "claude-haiku-4-5",
  );
  assertEquals(
    resolveWatchlistAnthropicModelId({
      ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
      DAILY_BRIEF_MODEL: "claude-haiku-3",
    }),
    "claude-haiku-4-5-20251001",
  );
  assertEquals(
    resolveWatchlistAnthropicModelId({
      DAILY_BRIEF_MODEL: "claude-haiku-3",
    }),
    DEFAULT_ANTHROPIC_HAIKU_MODEL,
  );
});

Deno.test("resolveDailyBriefAnthropicModelId: DAILY_BRIEF_MODEL then ANTHROPIC_MODEL", () => {
  assertEquals(
    resolveDailyBriefAnthropicModelId({
      DAILY_BRIEF_MODEL: "claude-haiku-3",
      WATCHLIST_AI_MODEL: "claude-haiku-4-5",
      ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
    }),
    "claude-haiku-3",
  );
  assertEquals(
    resolveDailyBriefAnthropicModelId({
      WATCHLIST_AI_MODEL: "claude-haiku-4-5",
      ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
    }),
    "claude-haiku-4-5-20251001",
  );
  assertEquals(
    resolveDailyBriefAnthropicModelId({
      WATCHLIST_AI_MODEL: "claude-haiku-4-5",
    }),
    DEFAULT_ANTHROPIC_HAIKU_MODEL,
  );
});

Deno.test("sanitizeAnthropicModelId rejects empty and malformed ids", () => {
  assertEquals(sanitizeAnthropicModelId("  claude-haiku-4-5  "), "claude-haiku-4-5");
  assertEquals(sanitizeAnthropicModelId(""), null);
  assertEquals(sanitizeAnthropicModelId("not-a-model"), null);
});

Deno.test("isPermanentAnthropicHttpFailure covers auth and model configuration errors", () => {
  assertEquals(
    isPermanentAnthropicHttpFailure({ httpStatus: 401, errorType: null }),
    true,
  );
  assertEquals(
    isPermanentAnthropicHttpFailure({ httpStatus: 404, errorType: "not_found_error" }),
    true,
  );
});