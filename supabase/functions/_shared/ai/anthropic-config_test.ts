import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_ANTHROPIC_HAIKU_MODEL,
  isPermanentAnthropicHttpFailure,
  resolveAnthropicHaikuModelId,
  sanitizeAnthropicModelId,
} from "./anthropic-config.ts";

Deno.test("resolveAnthropicHaikuModelId prefers ANTHROPIC_MODEL then surface overrides", () => {
  assertEquals(
    resolveAnthropicHaikuModelId({
      ANTHROPIC_MODEL: "claude-haiku-4-5",
      WATCHLIST_AI_MODEL: "claude-haiku-4-5-20251001",
    }),
    "claude-haiku-4-5",
  );
  assertEquals(
    resolveAnthropicHaikuModelId({
      WATCHLIST_AI_MODEL: "claude-haiku-4-5-20251001",
    }),
    "claude-haiku-4-5-20251001",
  );
  assertEquals(resolveAnthropicHaikuModelId({}), DEFAULT_ANTHROPIC_HAIKU_MODEL);
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
  assertFalse(
    isPermanentAnthropicHttpFailure({ httpStatus: 503, errorType: "overloaded_error" }),
  );
});