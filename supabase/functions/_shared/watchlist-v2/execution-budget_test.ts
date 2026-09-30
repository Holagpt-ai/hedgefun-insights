import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AI_MAX_TRANSPORT_ATTEMPTS } from "../ai/retry-policy.ts";
import {
  WATCHLIST_BATCH_ANALYZER_INVOKE_TIMEOUT_MS,
  WATCHLIST_EXECUTION_HEADROOM_MS,
  WATCHLIST_RETRY_BACKOFF_WORST_MS,
  WATCHLIST_TRIGGER_NON_AI_RESERVE_MS,
  watchlistTriggerProviderAttemptTimeoutMs,
  watchlistTriggerTransportFitsBatchBudget,
  worstCaseWatchlistTriggerTransportWallClockMs,
} from "./execution-budget.ts";

Deno.test("trigger transport retry envelope fits batch analyzer invoke timeout", () => {
  assertEquals(watchlistTriggerTransportFitsBatchBudget(), true);
  const total = worstCaseWatchlistTriggerTransportWallClockMs()
    + WATCHLIST_TRIGGER_NON_AI_RESERVE_MS
    + WATCHLIST_EXECUTION_HEADROOM_MS;
  assertEquals(total <= WATCHLIST_BATCH_ANALYZER_INVOKE_TIMEOUT_MS, true);
  assertEquals(
    AI_MAX_TRANSPORT_ATTEMPTS * watchlistTriggerProviderAttemptTimeoutMs()
      + WATCHLIST_RETRY_BACKOFF_WORST_MS,
    worstCaseWatchlistTriggerTransportWallClockMs(),
  );
});
