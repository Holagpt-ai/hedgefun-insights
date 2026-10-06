/**
 * Session-aware Watchlist snapshot trust (mirrors watchlist-v2/session.ts surveillance window).
 * Used by UI trust badges only — does not change provider fetch or stored quotes.
 */

import {
  getEtParts,
  isMarketHoliday,
  isTradingDay,
  isWeekendDate,
  previousTradingDay,
} from "@/lib/market-calendar";

/** Watchlist minute buckets (04:00–20:00 ET surveillance). */
export function watchlistSessionBucket(
  minutesFromMidnight: number,
): "closed" | "premarket" | "rth" | "postclose" {
  if (!Number.isFinite(minutesFromMidnight) || minutesFromMidnight < 4 * 60 || minutesFromMidnight >= 20 * 60) {
    return "closed";
  }
  if (minutesFromMidnight < 9 * 60 + 30) return "premarket";
  if (minutesFromMidnight < 16 * 60) return "rth";
  return "postclose";
}

/** ET calendar date (YYYY-MM-DD) for a snapshot timestamp. */
export function snapshotEtDate(snapshotMs: number): string | null {
  if (!Number.isFinite(snapshotMs) || snapshotMs <= 0) return null;
  return getEtParts(new Date(snapshotMs)).date;
}

/**
 * Last equity session whose data may be shown when the live surveillance window is closed.
 * Matches supabase watchlist-v2/session.ts inferLastCompletedSessionDate.
 */
export function inferLastCompletedWatchlistSessionDate(now: Date): string {
  const et = getEtParts(now);
  const trading = isTradingDay(et.date, et.weekday);
  if (!trading || et.minutes < 4 * 60) return previousTradingDay(et.date).date;
  return et.date;
}

/**
 * True when Watchlist should not expect live quote updates (overnight, weekend, holiday, post-8pm ET).
 */
export function isWatchlistClosedSurveillanceWindow(nowMs: number): boolean {
  const et = getEtParts(new Date(nowMs));
  if (isWeekendDate(et.weekday) || isMarketHoliday(et.date)) return true;
  return watchlistSessionBucket(et.minutes) === "closed";
}

export function isSnapshotFromExpectedLastSession(input: {
  snapshotMs: number;
  analysisSessionDate: string | null | undefined;
  nowMs: number;
}): boolean {
  const snapshotDate = snapshotEtDate(input.snapshotMs);
  if (!snapshotDate) return false;
  const expected = inferLastCompletedWatchlistSessionDate(new Date(input.nowMs));
  const sessionDate = typeof input.analysisSessionDate === "string" && input.analysisSessionDate.trim()
    ? input.analysisSessionDate.trim()
    : null;
  if (snapshotDate !== expected) return false;
  if (sessionDate && sessionDate !== expected) return false;
  return true;
}
