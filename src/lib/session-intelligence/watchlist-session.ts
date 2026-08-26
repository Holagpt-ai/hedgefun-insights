import type { MarketContextStatus } from "@/types/pre-market";

export interface WatchlistSessionNotice {
  compact: boolean;
  headline: string;
  detail: string;
}

export function isActivePremarketSession(status: MarketContextStatus | null | undefined): boolean {
  return status === "premarket";
}

export function watchlistTrackedCount(
  activityTickers: readonly string[],
  lifecycleTickers: readonly string[],
): number {
  const seen = new Set<string>();
  for (const t of activityTickers) {
    if (t) seen.add(t);
  }
  for (const t of lifecycleTickers) {
    if (t) seen.add(t);
  }
  return seen.size;
}

/**
 * Compact presentation when Pre-Market is not the active session.
 * Returns null during a confirmed pre-market session (full rows stay visible).
 */
export function compactWatchlistNotice(
  status: MarketContextStatus | null | undefined,
  trackedCount: number,
): WatchlistSessionNotice | null {
  if (isActivePremarketSession(status)) return null;

  const headline =
    status === "non_trading_day"
      ? "No Pre-Market session today."
      : status === "unavailable"
        ? "The market session cannot be confirmed."
        : "Pre-market session has ended.";

  const noun = trackedCount === 1 ? "symbol" : "symbols";
  return {
    compact: true,
    headline,
    detail: `${trackedCount} Watchlist ${noun} tracked.`,
  };
}
