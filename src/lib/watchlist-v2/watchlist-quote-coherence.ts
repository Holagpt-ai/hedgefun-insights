/**
 * Watchlist quote/session coherence (client). Mirrors watchlist-v2/market-data effectiveSnapshotQuality.
 */

import { WATCHLIST_SNAPSHOT_STALE_MS } from "@/lib/market-data/trust-states";
import { snapshotEtDate } from "@/lib/watchlist-v2/watchlist-snapshot-trust";

export function expectedWatchlistAnalysisSessionDate(input: {
  analysisSessionDate: string | null | undefined;
  snapshotMs: number | null;
}): string | null {
  if (typeof input.analysisSessionDate === "string" && input.analysisSessionDate.trim()) {
    return input.analysisSessionDate.trim();
  }
  if (input.snapshotMs !== null && Number.isFinite(input.snapshotMs)) {
    return snapshotEtDate(input.snapshotMs);
  }
  return null;
}

/** Quote price display uses the stored snapshot timestamp only — not minute bars. */
export function watchlistQuoteDisplayTimestampMs(snapshotMs: number | null): number | null {
  if (snapshotMs === null || !Number.isFinite(snapshotMs) || snapshotMs <= 0) return null;
  return snapshotMs;
}

function isCoherentSameSessionBar(input: {
  barMs: number;
  expectedSessionDate: string;
  snapshotMs: number | null;
  nowMs: number;
}): boolean {
  const { barMs, expectedSessionDate, snapshotMs, nowMs } = input;
  if (!Number.isFinite(barMs) || barMs <= 0) return false;
  if (barMs > nowMs) return false;
  if (snapshotEtDate(barMs) !== expectedSessionDate) return false;
  if (snapshotMs !== null && Number.isFinite(snapshotMs)) {
    const snapshotDate = snapshotEtDate(snapshotMs);
    if (snapshotDate !== expectedSessionDate) return false;
  }
  if (nowMs - barMs > WATCHLIST_SNAPSHOT_STALE_MS) return false;
  return true;
}

/** Newest minute bar that belongs to the analysis session and is not future-dated. */
export function latestCoherentIntradayBarMs(input: {
  intradayBars: readonly { t: number }[];
  expectedSessionDate: string;
  snapshotMs: number | null;
  nowMs: number;
}): number | null {
  let best: number | null = null;
  for (const bar of input.intradayBars) {
    if (
      !isCoherentSameSessionBar({
        barMs: bar.t,
        expectedSessionDate: input.expectedSessionDate,
        snapshotMs: input.snapshotMs,
        nowMs: input.nowMs,
      })
    ) {
      continue;
    }
    if (best === null || bar.t > best) best = bar.t;
  }
  return best;
}

/**
 * When the stored snapshot timestamp is wall-clock stale but same-session minute bars
 * are fresh, trust can remain FRESH. Does not change which timestamp labels the quote.
 */
export function watchlistIntradayRelievesStaleSnapshot(input: {
  analysisPresentation: "live" | "last_completed" | null | undefined;
  analysisSessionDate: string | null | undefined;
  snapshotMs: number | null;
  intradayBars: readonly { t: number }[];
  nowMs?: number;
}): boolean {
  if (input.analysisPresentation !== "live") return false;
  const nowMs = input.nowMs ?? Date.now();
  const snapshotMs = input.snapshotMs;
  if (snapshotMs === null || !Number.isFinite(snapshotMs)) return false;
  if (nowMs - snapshotMs <= WATCHLIST_SNAPSHOT_STALE_MS) return false;

  const sessionDate = expectedWatchlistAnalysisSessionDate({
    analysisSessionDate: input.analysisSessionDate,
    snapshotMs,
  });
  if (!sessionDate) return false;

  const barMs = latestCoherentIntradayBarMs({
    intradayBars: input.intradayBars,
    expectedSessionDate: sessionDate,
    snapshotMs,
    nowMs,
  });
  return barMs !== null;
}
