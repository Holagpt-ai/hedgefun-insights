// Pure helpers for the Catalyst frontend.
// No React, no data fetching, no side effects — safe to unit-test.

import type { CatalystEventType } from "@/types/catalyst";

export const EVENT_TYPE_LABEL: Record<CatalystEventType, string> = {
  earnings: "Earnings",
  fda_biotech: "FDA / Biotech",
  merger_acquisition: "M&A",
  analyst_action: "Analyst Actions",
  sec_filing_news: "SEC / Filing News",
  corporate_action: "Corporate Actions",
  product_contract: "Product / Contract",
  company_news: "Company News",
};

export const EVENT_TYPE_ORDER: readonly CatalystEventType[] = [
  "earnings",
  "fda_biotech",
  "merger_acquisition",
  "analyst_action",
  "sec_filing_news",
  "corporate_action",
  "product_contract",
  "company_news",
] as const;

export type HorizonFilter =
  | "today"
  | "next_7_days"
  | "next_30_days"
  | "recent_72h";

export const HORIZON_LABEL: Record<HorizonFilter, string> = {
  today: "Today",
  next_7_days: "Next 7 Days",
  next_30_days: "Next 30 Days",
  recent_72h: "Recent 72 Hours",
};

export type WorkflowFilter = "all" | "watchlist" | "saved" | "reviewed";

export const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!TICKER_REGEX.test(t)) return null;
  return t;
}

export function timeOfDayLabel(v: string | null | undefined): string | null {
  switch (v) {
    case "before_open": return "Before Open";
    case "after_close": return "After Close";
    case "during": return "During Market Hours";
    case "unknown": return "Time Unavailable";
    default: return null;
  }
}

/**
 * Convert a YYYY-MM-DD (interpreted as an America/New_York calendar date)
 * to the ms of ET midnight for that day. Handles EST/EDT via Intl offset.
 */
export function etMidnightMs(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const utcNoon = Date.UTC(y, mo - 1, d, 12);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(utcNoon));
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /GMT([+-]\d+)(?::?(\d+))?/.exec(tz);
  const hrs = match ? Number(match[1]) : -5;
  const mins = match && match[2] ? Number(match[2]) * Math.sign(hrs || -1) : 0;
  return Date.UTC(y, mo - 1, d, -hrs, -mins, 0);
}

/**
 * ET calendar start-of-day (midnight America/New_York) for the ET day that
 * contains `nowMs`. Independent of the runtime's local timezone.
 */
export function etStartOfDayMs(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return etMidnightMs(`${y}-${mo}-${d}`) ?? 0;
}

/**
 * Scheduled moment for catalysts: explicit event_time when present,
 * otherwise ET midnight of event_date. Never falls back to published_at,
 * so a date-only earnings on today's ET calendar day is always scheduled.
 */
export function scheduledMomentMs(row: {
  event_time?: string | null;
  event_date?: string | null;
}): number | null {
  if (row.event_time) {
    const t = Date.parse(row.event_time);
    if (Number.isFinite(t)) return t;
  }
  if (row.event_date) {
    const et = etMidnightMs(row.event_date);
    if (et !== null) return et;
  }
  return null;
}

/**
 * Returns the effective moment (ms) of an event for sort/window purposes.
 * Prefers explicit event_time, then published_at, then ET midnight of
 * event_date (date-only earnings/catalysts are ET calendar dates).
 */
export function eventMomentMs(row: {
  event_time?: string | null;
  published_at?: string | null;
  event_date?: string | null;
}): number | null {
  if (row.event_time) {
    const t = Date.parse(row.event_time);
    if (Number.isFinite(t)) return t;
  }
  if (row.published_at) {
    const t = Date.parse(row.published_at);
    if (Number.isFinite(t)) return t;
  }
  if (row.event_date) {
    const et = etMidnightMs(row.event_date);
    if (et !== null) return et;
    const t = Date.parse(`${row.event_date}T00:00:00Z`);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export interface HorizonWindow {
  fromMs: number;
  toMs: number;
  scheduled: boolean; // true = future/scheduled bucket, false = recent-reported
}

export function horizonWindow(h: HorizonFilter, nowMs: number): HorizonWindow {
  const day = 24 * 60 * 60 * 1000;
  switch (h) {
    case "today":
      // Start of local UTC day → +1 day.
      {
        const d = new Date(nowMs);
        const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return { fromMs: start, toMs: start + day, scheduled: true };
      }
    case "next_7_days":
      return { fromMs: nowMs, toMs: nowMs + 7 * day, scheduled: true };
    case "next_30_days":
      return { fromMs: nowMs, toMs: nowMs + 30 * day, scheduled: true };
    case "recent_72h":
      return { fromMs: nowMs - 3 * day, toMs: nowMs, scheduled: false };
  }
}

export function isWithinHorizon(
  row: Parameters<typeof eventMomentMs>[0],
  h: HorizonFilter,
  nowMs: number,
): boolean {
  const m = eventMomentMs(row);
  if (m === null) return false;
  const w = horizonWindow(h, nowMs);
  return m >= w.fromMs && m <= w.toMs;
}

/**
 * Deterministic comparator:
 * - Scheduled/future events: nearest date first (ascending time).
 * - Recent/past events: newest first (descending time).
 * - Ties break alphabetically by symbol.
 */
export function makeComparator(scheduled: boolean, nowMs: number) {
  return (a: any, b: any): number => {
    const am = eventMomentMs(a);
    const bm = eventMomentMs(b);
    if (am === null && bm === null) return String(a.symbol ?? "").localeCompare(String(b.symbol ?? ""));
    if (am === null) return 1;
    if (bm === null) return -1;
    if (scheduled) {
      // upcoming first: entries closer to now (but ≥ now) come first
      const diff = am - bm;
      if (diff !== 0) return diff;
    } else {
      const diff = bm - am;
      if (diff !== 0) return diff;
    }
    return String(a.symbol ?? "").localeCompare(String(b.symbol ?? ""));
  };
}

export function isFuture(row: Parameters<typeof eventMomentMs>[0], nowMs: number): boolean {
  const m = eventMomentMs(row);
  return m !== null && m >= nowMs;
}

export function isRecent(row: Parameters<typeof eventMomentMs>[0], nowMs: number, hours: number): boolean {
  const m = eventMomentMs(row);
  if (m === null) return false;
  const cutoff = nowMs - hours * 60 * 60 * 1000;
  return m <= nowMs && m >= cutoff;
}

/** Formatter for a single earnings fact value; never fabricates. */
export function formatEpsValue(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v.toFixed(2);
}

export function formatSurprisePct(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
