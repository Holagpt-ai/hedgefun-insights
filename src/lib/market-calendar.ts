/**
 * US equity market calendar helpers (America/New_York).
 * Pure and injectable: every function accepts an explicit `now` so it can be tested
 * deterministically. Session taxonomy is owned by src/config/inbox.config.ts.
 */

import { MARKET_SESSIONS, type MarketSession, type MarketSessionId } from "@/config/inbox.config";

export interface EtParts {
  /** YYYY-MM-DD in ET */
  date: string;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  hour: number;
  minute: number;
  second: number;
  /** minutes from ET midnight */
  minutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function getEtParts(now: Date): EtParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (!Number.isFinite(hour) || hour === 24) hour = 0;
  const minute = parseInt(get("minute"), 10) || 0;
  const second = parseInt(get("second"), 10) || 0;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    hour, minute, second,
    minutes: hour * 60 + minute,
  };
}

/** Full-closure US equity market holidays (ET dates). */
export const MARKET_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** Scheduled early closes: ET date -> regular-session close in minutes from ET midnight. */
export const MARKET_EARLY_CLOSES: Readonly<Record<string, number>> = {
  "2025-07-03": 780, "2025-11-28": 780, "2025-12-24": 780,
  "2026-11-27": 780, "2026-12-24": 780,
  "2027-07-02": 780, "2027-11-26": 780,
};

export function isWeekendDate(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

export function isMarketHoliday(date: string): boolean {
  return MARKET_HOLIDAYS.has(date);
}

export function isTradingDay(date: string, weekday: number): boolean {
  return !isWeekendDate(weekday) && !isMarketHoliday(date);
}

/** Regular-session close (minutes from ET midnight) for a given ET date. */
export function getRegularCloseMins(date: string): number {
  return MARKET_EARLY_CLOSES[date] ?? 960;
}

function toUtcNoon(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function fromUtcNoon(d: Date): { date: string; weekday: number } {
  const iso = d.toISOString().slice(0, 10);
  return { date: iso, weekday: d.getUTCDay() };
}

/** Next trading ET date strictly after `date`. */
export function nextTradingDay(date: string): { date: string; weekday: number; daysAhead: number } {
  const base = toUtcNoon(date);
  for (let i = 1; i <= 15; i++) {
    const cand = new Date(base.getTime() + i * 86400000);
    const { date: d, weekday } = fromUtcNoon(cand);
    if (isTradingDay(d, weekday)) return { date: d, weekday, daysAhead: i };
  }
  return { date, weekday: 0, daysAhead: 0 };
}

export function getSession(id: MarketSessionId): MarketSession {
  return MARKET_SESSIONS.find((s) => s.id === id) ?? MARKET_SESSIONS[MARKET_SESSIONS.length - 1];
}

export function formatEt12h(p: EtParts): string {
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const suffix = p.hour < 12 ? "AM" : "PM";
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${h12}:${pad(p.minute)}:${pad(p.second)} ${suffix}`;
}

export function formatMins12h(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h12}:${m < 10 ? "0" + m : m} ${suffix}`;
}

function formatCountdown(totalSecs: number): string {
  const s = Math.max(totalSecs, 0);
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export interface MarketClockState {
  sessionId: MarketSessionId;
  label: string;
  dot: MarketSession["dot"];
  countdown: string;
  subLabel: string;
  /** 12-hour ET wall clock, e.g. "1:18:21 PM" */
  etTimeStr: string;
  isTradingDay: boolean;
}

/**
 * Resolve the full clock state for an instant. Calendar-first: a non-trading ET date
 * can never yield an active session.
 */
export function resolveMarketClock(now: Date): MarketClockState {
  const p = getEtParts(now);
  const etTimeStr = formatEt12h(p);
  const tradingDay = isTradingDay(p.date, p.weekday);
  const closed = getSession("closed");

  const countdownTo = (targetMins: number, daysAhead: number) => {
    const secs = (targetMins + daysAhead * 1440) * 60 - (p.minutes * 60 + p.second);
    return formatCountdown(secs);
  };

  if (!tradingDay) {
    const next = nextTradingDay(p.date);
    const preOpen = getSession("pre-market").rangeStart ?? 240;
    return {
      sessionId: "closed",
      label: closed.label,
      dot: closed.dot,
      countdown: countdownTo(preOpen, next.daysAhead),
      subLabel: `Next session: ${formatSessionDate(next.date)} · pre-market ${formatMins12h(preOpen)} ET`,
      etTimeStr,
      isTradingDay: false,
    };
  }

  const preMarket = getSession("pre-market");
  const market = getSession("market");
  const afterHours = getSession("after-hours");
  const preStart = preMarket.rangeStart ?? 240;
  const openMins = market.rangeStart ?? 570;
  const closeMins = getRegularCloseMins(p.date);
  const ahEnd = (afterHours.countdownTargetMins ?? 1200);

  if (p.minutes < preStart) {
    return {
      sessionId: "closed",
      label: closed.label,
      dot: closed.dot,
      countdown: countdownTo(preStart, 0),
      subLabel: `Pre-market opens ${formatMins12h(preStart)} ET`,
      etTimeStr,
      isTradingDay: true,
    };
  }

  if (p.minutes < openMins) {
    return {
      sessionId: "pre-market",
      label: preMarket.label,
      dot: preMarket.dot,
      countdown: countdownTo(openMins, 0),
      subLabel: `Market opens ${formatMins12h(openMins)} ET`,
      etTimeStr,
      isTradingDay: true,
    };
  }

  if (p.minutes < closeMins) {
    return {
      sessionId: "market",
      label: market.label,
      dot: market.dot,
      countdown: countdownTo(closeMins, 0),
      subLabel:
        closeMins === 960
          ? `Market closes ${formatMins12h(closeMins)} ET`
          : `Early close · market closes ${formatMins12h(closeMins)} ET`,
      etTimeStr,
      isTradingDay: true,
    };
  }

  if (p.minutes < ahEnd) {
    return {
      sessionId: "after-hours",
      label: afterHours.label,
      dot: afterHours.dot,
      countdown: countdownTo(ahEnd, 0),
      subLabel: `After-hours ${formatMins12h(closeMins)} – ${formatMins12h(ahEnd)} ET`,
      etTimeStr,
      isTradingDay: true,
    };
  }

  const next = nextTradingDay(p.date);
  return {
    sessionId: "closed",
    label: closed.label,
    dot: closed.dot,
    countdown: countdownTo(preStart, next.daysAhead),
    subLabel: `Next session: ${formatSessionDate(next.date)} · pre-market ${formatMins12h(preStart)} ET`,
    etTimeStr,
    isTradingDay: true,
  };
}

export function formatSessionDate(date: string): string {
  const d = toUtcNoon(date);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
  }).format(d);
}
