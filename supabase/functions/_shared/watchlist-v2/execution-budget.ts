/**
 * Watchlist analyzer budgets: batch/trigger invocations are capped by the batch worker.
 * Manual refresh uses a separate, longer provider envelope.
 */

import {
  AI_MAX_TRANSPORT_ATTEMPTS,
  AI_RETRY_BASE_MS,
  AI_RETRY_JITTER_MS,
} from "../ai/retry-policy.ts";

/** run-watchlist-analysis-v2-batch → analyze-watchlist-tickers-v2 invoke timeout. */
export const WATCHLIST_BATCH_ANALYZER_INVOKE_TIMEOUT_MS = 25_000;

/** Manual user refresh (direct edge invoke; longer platform budget). */
export const WATCHLIST_MANUAL_TRANSPORT_WALL_CLOCK_MS = 55_000;

export const WATCHLIST_MANUAL_PROVIDER_TIMEOUT_MS = 20_000;

/** Fetch, sufficiency, finalize outside Anthropic (trigger/batch). */
export const WATCHLIST_TRIGGER_NON_AI_RESERVE_MS = 6_000;

export const WATCHLIST_EXECUTION_HEADROOM_MS = 2_000;

export const WATCHLIST_RETRY_BACKOFF_WORST_MS = AI_RETRY_BASE_MS + AI_RETRY_JITTER_MS;

export function watchlistTriggerProviderAttemptTimeoutMs(): number {
  const providerBudget =
    WATCHLIST_BATCH_ANALYZER_INVOKE_TIMEOUT_MS
    - WATCHLIST_TRIGGER_NON_AI_RESERVE_MS
    - WATCHLIST_RETRY_BACKOFF_WORST_MS
    - WATCHLIST_EXECUTION_HEADROOM_MS;
  return Math.floor(providerBudget / AI_MAX_TRANSPORT_ATTEMPTS);
}

export function worstCaseWatchlistTriggerTransportWallClockMs(): number {
  return AI_MAX_TRANSPORT_ATTEMPTS * watchlistTriggerProviderAttemptTimeoutMs()
    + WATCHLIST_RETRY_BACKOFF_WORST_MS;
}

export function watchlistTriggerTransportFitsBatchBudget(): boolean {
  return worstCaseWatchlistTriggerTransportWallClockMs()
    + WATCHLIST_TRIGGER_NON_AI_RESERVE_MS
    + WATCHLIST_EXECUTION_HEADROOM_MS
    <= WATCHLIST_BATCH_ANALYZER_INVOKE_TIMEOUT_MS;
}

export function resolveWatchlistProviderTimeoutMs(input: {
  triggerType: "manual" | "trigger" | "batch";
}): number {
  return input.triggerType === "manual"
    ? WATCHLIST_MANUAL_PROVIDER_TIMEOUT_MS
    : watchlistTriggerProviderAttemptTimeoutMs();
}

export function resolveWatchlistTransportWallClockBudgetMs(input: {
  triggerType: "manual" | "trigger" | "batch";
}): number {
  return input.triggerType === "manual"
    ? WATCHLIST_MANUAL_TRANSPORT_WALL_CLOCK_MS
    : WATCHLIST_BATCH_ANALYZER_INVOKE_TIMEOUT_MS;
}
