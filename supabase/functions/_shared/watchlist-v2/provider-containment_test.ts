import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isProviderWideWatchlistAiFailure,
  WATCHLIST_BATCH_PROVIDER_WIDE_CONTAINMENT_THRESHOLD,
} from "./provider-containment.ts";

Deno.test("AI_AUTH and account/model http classes are provider-wide", () => {
  assert(isProviderWideWatchlistAiFailure({ errorCode: "AI_AUTH", httpStatus: null }));
  assert(isProviderWideWatchlistAiFailure({
    errorCode: "AI_PROVIDER_ERROR",
    httpStatus: 404,
    errorType: "not_found_error",
  }));
});

Deno.test("transient and ticker-scoped failures are not provider-wide", () => {
  assertEquals(
    isProviderWideWatchlistAiFailure({
      errorCode: "AI_PROVIDER_ERROR",
      httpStatus: 529,
      errorType: "overloaded_error",
    }),
    false,
  );
  assertEquals(
    isProviderWideWatchlistAiFailure({
      errorCode: "AI_PROVIDER_ERROR",
      httpStatus: 400,
      errorType: "invalid_request_error",
    }),
    false,
  );
  assertEquals(
    isProviderWideWatchlistAiFailure({ errorCode: "AI_VALIDATION_FAILED", httpStatus: 200 }),
    false,
  );
});

Deno.test("batch containment threshold is at least two confirmed provider-wide signals", () => {
  assertEquals(WATCHLIST_BATCH_PROVIDER_WIDE_CONTAINMENT_THRESHOLD, 2);
});