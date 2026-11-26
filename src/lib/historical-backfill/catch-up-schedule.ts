/**
 * Post-session catch-up target resolution (operator / external scheduler — not activated in prod).
 */
import {
  isMarketHoliday,
  isTradingDay,
  isWeekendDate,
  previousTradingDay,
} from "@/lib/market-calendar";

function utcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayForDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Latest completed U.S. equity session at or before {@link now} (UTC). */
export function resolveLatestCompletedTradingSession(now: Date = new Date()): string {
  let cursor = utcYmd(now);
  for (let i = 0; i < 12; i += 1) {
    const wd = weekdayForDate(cursor);
    if (isTradingDay(cursor, wd) && !isMarketHoliday(cursor)) {
      return cursor;
    }
    cursor = previousTradingDay(cursor).date;
  }
  throw new Error("could not resolve a completed trading session within 12 days");
}

/** Five-year rolling floor (calendar) from a reference session — policy cap only. */
export function rollingFiveYearEntitlementFloorCap(referenceSession: string): string {
  const [y, m, d] = referenceSession.split("-").map(Number);
  const floor = new Date(Date.UTC(y - 5, m - 1, d));
  return utcYmd(floor);
}