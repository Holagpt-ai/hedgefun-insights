/**
 * Watchlist quote/session coherence (client). Mirrors watchlist-v2/market-data effectiveSnapshotQuality.
 */

import { WATCHLIST_SNAPSHOT_STALE_MS } from "@/lib/market-data/trust-states";
import { snapshotEtDate } from "@/lib/watchlist-v2/watchlist-snapshot-trust";

export function latestIntradayBarMs(bars: readonly { t: number }[]): number | null {
  if (bars.length === 0) return null;
  let best: number | null = null;
  for (const bar of bars) {
    if (!Number.isFinite(bar.t) || bar.t <= 0) continue;
    if (best === null || bar.t > best) best = bar.t;
  }
  return best;
}

/**
 * When the stored snapshot timestamp is wall-clock stale but minute bars for the
 * analysis session are fresh, treat quote evidence as still current.
 */
export function watchlistIntradayRelievesStaleSnapshot(input: {
  analysisPresentation: "live" | "last_completed" | null | undefined;
  analysisSessionDate: string | null | undefined;
  snapshotMs: number | null;
  intradayBars: readonly { t: number }[];
  nowMs?: number;
}): boolean {
  if (input.analysisPresentation === "last_completed") return false;
  const nowMs = input.nowMs ?? Date.now();
  const snapshotMs = input.snapshotMs;
  if (snapshotMs === null || !Number.isFinite(snapshotMs)) return false;
  if (nowMs - snapshotMs <= WATCHLIST_SNAPSHOT_STALE_MS) return false;

  const sessionDate =
    typeof input.analysisSessionDate === "string" && input.analysisSessionDate.trim()
      ? input.analysisSessionDate.trim()
      : snapshotEtDate(snapshotMs);
  if (!sessionDate) return false;

  const barMs = latestIntradayBarMs(input.intradayBars);
  if (barMs === null) return false;
  if (snapshotEtDate(barMs) !== sessionDate) return false;
  return nowMs - barMs <= WATCHLIST_SNAPSHOT_STALE_MS;
}

export function watchlistQuoteEvidenceMs(input: {
  snapshotMs: number | null;
  intradayBars: readonly { t: number }[];
}): number | null {
  const barMs = latestIntradayBarMs(input.intradayBars);
  if (input.snapshotMs !== null && Number.isFinite(input.snapshotMs)) {
    if (barMs === null) return input.snapshotMs;
    return Math.max(input.snapshotMs, barMs);
  }
  return barMs;
}
