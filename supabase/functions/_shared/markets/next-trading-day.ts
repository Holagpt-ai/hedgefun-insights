/** Minimal trading-day calendar (mirrors src/lib/market-calendar.ts). */

export const MARKET_HOLIDAYS: ReadonlySet<string> = new Set([
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

function isWeekendDate(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

export function isTradingDay(date: string, weekday: number): boolean {
  return !isWeekendDate(weekday) && !MARKET_HOLIDAYS.has(date);
}

function toUtcNoon(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function fromUtcNoon(d: Date): { date: string; weekday: number } {
  const iso = d.toISOString().slice(0, 10);
  return { date: iso, weekday: d.getUTCDay() };
}

export function nextTradingDay(date: string): { date: string; weekday: number; daysAhead: number } {
  const base = toUtcNoon(date);
  for (let i = 1; i <= 15; i++) {
    const cand = new Date(base.getTime() + i * 86400000);
    const { date: d, weekday } = fromUtcNoon(cand);
    if (isTradingDay(d, weekday)) return { date: d, weekday, daysAhead: i };
  }
  return { date, weekday: 0, daysAhead: 0 };
}

export function isMarketHoliday(date: string): boolean {
  return MARKET_HOLIDAYS.has(date);
}

/** Scheduled early closes: ET date -> regular-session close in minutes from ET midnight. */
export const MARKET_EARLY_CLOSES: Readonly<Record<string, number>> = {
  "2025-07-03": 780, "2025-11-28": 780, "2025-12-24": 780,
  "2026-11-27": 780, "2026-12-24": 780,
  "2027-07-02": 780, "2027-11-26": 780,
};

export function weekdayOfIsoDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const probe = toUtcNoon(date);
  if (Number.isNaN(probe.getTime())) return null;
  const parts = fromUtcNoon(probe);
  return parts.date === date ? parts.weekday : null;
}

/**
 * Previous US equity session strictly before `date`.
 * Walks calendar dates at UTC noon so DST cannot skip or repeat a day.
 */
export function previousTradingDay(date: string): { date: string; weekday: number; daysBack: number } {
  const base = toUtcNoon(date);
  for (let i = 1; i <= 15; i++) {
    const cand = new Date(base.getTime() - i * 86400000);
    const parts = fromUtcNoon(cand);
    if (isTradingDay(parts.date, parts.weekday)) {
      return { date: parts.date, weekday: parts.weekday, daysBack: i };
    }
  }
  return { date, weekday: weekdayOfIsoDate(date) ?? 0, daysBack: 0 };
}

export function lastTradingDateOnOrBeforeIso(date: string, includeReferenceDay: boolean): string {
  const weekday = weekdayOfIsoDate(date);
  if (includeReferenceDay && weekday !== null && isTradingDay(date, weekday)) return date;
  return previousTradingDay(date).date;
}
