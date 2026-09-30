import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  failureCodeFromCategory,
  failureCodeFromWatchlistError,
  isAiFailureCode,
} from "./failure-codes.ts";

Deno.test("maps normalized categories to AI failure codes", () => {
  assertEquals(failureCodeFromCategory("RATE_LIMIT"), "AI_RATE_LIMITED");
  assertEquals(failureCodeFromCategory("TIMEOUT"), "AI_PROVIDER_TIMEOUT");
  assertEquals(failureCodeFromCategory("AUTH"), "AI_PROVIDER_AUTH_ERROR");
  assertEquals(failureCodeFromCategory("MALFORMED_RESPONSE", { emptyResponse: true }), "AI_EMPTY_RESPONSE");
  assertEquals(failureCodeFromCategory("STALE_INPUT"), "AI_STALE_CONTEXT");
});

Deno.test("maps watchlist analyzer codes", () => {
  assertEquals(failureCodeFromWatchlistError("AI_TIMEOUT"), "AI_PROVIDER_TIMEOUT");
  assertEquals(failureCodeFromWatchlistError("AI_VALIDATION_FAILED"), "AI_SCHEMA_VALIDATION_ERROR");
  assertEquals(failureCodeFromWatchlistError("SNAPSHOT_STALE"), null);
});

Deno.test("validates failure code strings", () => {
  assertEquals(isAiFailureCode("AI_UNKNOWN_ERROR"), true);
  assertEquals(isAiFailureCode("not_a_code"), false);
});
