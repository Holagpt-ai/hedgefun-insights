/**
 * Explicit market-session field helpers.
 * Day-session surfaces must pair regular_close with regular_change_pct.
 * After-hours surfaces must pair extended_last with after_hours_change_pct.
 * Never pair day.c with todaysChangePerc.
 *
 * Session windows come from a resolved U.S. equities schedule. When that
 * schedule is unavailable, readers fall back to 09:30 / 16:00 / 20:00 ET.
 */

import {
  fallbackOpenSchedule,
  isWithinAfterHoursWindow,
  NORMAL_AFTER_HOURS_END_MS,
  NORMAL_REGULAR_CLOSE_MS,
  sessionKindAtMsOfDay,
  type ResolvedSessionSchedule,
} from "@/lib/equities-session-calendar";

export type { ResolvedSessionSchedule };

export type SnapshotTicker = {
  ticker?: string;
  symbol?: string;
  name?: string;
  details?: { name?: string };
  todaysChange?: number;
  todaysChangePerc?: number;
  day?: { c?: number; o?: number; h?: number; l?: number; v?: number };
  prevDay?: { c?: number; v?: number };
  lastTrade?: { p?: number; t?: number };
  min?: { c?: number; t?: number; v?: number; av?: number };
  updated?: number;
  [key: string]: unknown;
};

export type SessionMetrics = {
  regular_close: number | null;
  previous_regular_close: number | null;
  regular_change_pct: number | null;
  extended_last: number | null;
  after_hours_change_pct: number | null;
  extended_total_change_pct: number | null;
  provider_day_volume: number | null;
  provider_previous_day_volume: number | null;
  market_session: "pre-market" | "market" | "after-hours" | "closed";
  provider_as_of: number | null;
};

/**
 * Normal full-session after-hours window (America/New_York):
 * strictly after 16:00:00.000 ET through 20:00:00.000 ET inclusive.
 *
 * Callers with a resolved schedule (including early-close / holiday rows)
 * should pass that schedule rather than relying on these fallback constants.
 */
export const AFTER_HOURS_OPEN_EXCLUSIVE_MS = NORMAL_REGULAR_CLOSE_MS;
export const AFTER_HOURS_END_INCLUSIVE_MS = NORMAL_AFTER_HOURS_END_MS;

/** Tie-break when two AH candidates share the same normalized timestamp. */
export const AFTER_HOURS_TIE_BREAK = "lastTrade" as const;

function finitePositive(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

function finiteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize provider timestamps to Unix epoch milliseconds.
 * Explicit magnitude bands for contemporary Unix times (≈2001–2286):
 *   seconds      [1e9, 1e10)
 *   milliseconds [1e11, 1e14)
 *   microseconds [1e14, 1e17)
 *   nanoseconds  [1e17, 1e20)
 * Values outside these bands are rejected rather than silently mis-scaled.
 */
export function providerTimestampMs(raw: unknown): number | null {
  const n = finiteNumber(raw);
  if (n === null || !(n > 0)) return null;

  let ms: number;
  if (n >= 1e17 && n < 1e20) {
    ms = Math.trunc(n / 1_000_000); // nanoseconds
  } else if (n >= 1e14 && n < 1e17) {
    ms = Math.trunc(n / 1_000); // microseconds
  } else if (n >= 1e11 && n < 1e14) {
    ms = Math.trunc(n); // milliseconds
  } else if (n >= 1e9 && n < 1e10) {
    ms = Math.trunc(n * 1_000); // seconds
  } else {
    return null;
  }

  if (!Number.isFinite(ms) || !(ms > 0)) return null;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2100) {
    return null;
  }
  return ms;
}

export type EasternWallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** Milliseconds since Eastern local midnight. */
  msOfDay: number;
  /** Minutes since Eastern local midnight (hour*60+minute). */
  mins: number;
};

/**
 * Intl.DateTimeFormatOptions in TypeScript 5.8 + ES2020 lib omits
 * fractionalSecondDigits. Intersect the documented runtime option rather than
 * dropping millisecond precision or using `any`.
 */
type EasternDateTimeFormatOptions = Intl.DateTimeFormatOptions & {
  fractionalSecondDigits: 1 | 2 | 3;
};

const EASTERN_FORMAT_OPTIONS: EasternDateTimeFormatOptions = {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
};

const easternFormatter = new Intl.DateTimeFormat("en-US", EASTERN_FORMAT_OPTIONS);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function easternDateFromParts(parts: EasternWallClock): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function scheduleOrFallback(
  referenceMs: number,
  schedule: ResolvedSessionSchedule | null | undefined,
): ResolvedSessionSchedule | null {
  if (schedule) return schedule;
  const parts = easternParts(referenceMs);
  if (!parts) return null;
  return fallbackOpenSchedule(easternDateFromParts(parts));
}

/** Eastern-time wall clock for a UTC epoch ms (America/New_York). */
export function easternParts(ms: number): EasternWallClock | null {
  if (!Number.isFinite(ms)) return null;
  const parts = easternFormatter.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second") ?? "0");
  const frac = get("fractionalSecond") ?? "0";
  const millisecond = Number(frac.padEnd(3, "0").slice(0, 3));
  // Some engines emit hour "24" for midnight.
  if (hour === 24) hour = 0;
  if (
    ![year, month, day, hour, minute, second, millisecond].every((v) =>
      Number.isFinite(v)
    )
  ) {
    return null;
  }
  const msOfDay =
    hour * 3_600_000 + minute * 60_000 + second * 1_000 + millisecond;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    msOfDay,
    mins: hour * 60 + minute,
  };
}

export function isAfterHoursTimestamp(
  rawTs: unknown,
  referenceMs: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): boolean {
  const tradeMs = providerTimestampMs(rawTs);
  if (tradeMs === null) return false;
  const trade = easternParts(tradeMs);
  const ref = easternParts(referenceMs);
  if (!trade || !ref) return false;
  const resolved = scheduleOrFallback(referenceMs, schedule);
  if (!resolved) return false;
  const tradeDate = easternDateFromParts(trade);
  const refDate = easternDateFromParts(ref);
  if (tradeDate !== refDate || tradeDate !== resolved.sessionDate) {
    return false;
  }
  return isWithinAfterHoursWindow(trade.msOfDay, resolved);
}

type AfterHoursCandidate = {
  price: number;
  ms: number;
  source: "lastTrade" | "min";
};

function afterHoursCandidate(
  priceRaw: unknown,
  tsRaw: unknown,
  source: "lastTrade" | "min",
  referenceMs: number,
  schedule?: ResolvedSessionSchedule | null,
): AfterHoursCandidate | null {
  const price = finitePositive(priceRaw);
  if (price === null) return null;
  if (!isAfterHoursTimestamp(tsRaw, referenceMs, schedule)) return null;
  const ms = providerTimestampMs(tsRaw);
  if (ms === null) return null;
  return { price, ms, source };
}

/**
 * Pick the newest valid after-hours observation.
 * Tie-break: prefer lastTrade over min when normalized timestamps are equal.
 * Never mixes one candidate's price with another's timestamp.
 */
export function selectNewestAfterHoursCandidate(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): AfterHoursCandidate | null {
  const candidates: AfterHoursCandidate[] = [];
  const last = afterHoursCandidate(
    t?.lastTrade?.p,
    t?.lastTrade?.t,
    "lastTrade",
    referenceMs,
    schedule,
  );
  if (last) candidates.push(last);
  const min = afterHoursCandidate(
    t?.min?.c,
    t?.min?.t,
    "min",
    referenceMs,
    schedule,
  );
  if (min) candidates.push(min);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.ms !== a.ms) return b.ms - a.ms;
    if (a.source === AFTER_HOURS_TIE_BREAK && b.source !== AFTER_HOURS_TIE_BREAK) {
      return -1;
    }
    if (b.source === AFTER_HOURS_TIE_BREAK && a.source !== AFTER_HOURS_TIE_BREAK) {
      return 1;
    }
    return 0;
  });
  return candidates[0] ?? null;
}

export function regularClose(t: SnapshotTicker): number | null {
  return finitePositive(t?.day?.c);
}

export function previousRegularClose(t: SnapshotTicker): number | null {
  return finitePositive(t?.prevDay?.c);
}

export function regularChangePercent(t: SnapshotTicker): number | null {
  const close = regularClose(t);
  const prev = previousRegularClose(t);
  if (close === null || prev === null) return null;
  const pct = ((close - prev) / prev) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/**
 * Verified extended-hours last from the newest valid AH observation among
 * lastTrade and min. Never falls back to day.c.
 */
export function extendedLast(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): number | null {
  return selectNewestAfterHoursCandidate(t, referenceMs, schedule)?.price ?? null;
}

export function afterHoursChangePercent(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): number | null {
  const last = extendedLast(t, referenceMs, schedule);
  const close = regularClose(t);
  if (last === null || close === null) return null;
  const pct = ((last - close) / close) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function extendedTotalChangePercent(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): number | null {
  const last = extendedLast(t, referenceMs, schedule);
  const prev = previousRegularClose(t);
  if (last === null || prev === null) return null;
  const pct = ((last - prev) / prev) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function providerDayVolume(t: SnapshotTicker): number | null {
  return finiteNumber(t?.day?.v);
}

export function providerPreviousDayVolume(t: SnapshotTicker): number | null {
  const v = finiteNumber(t?.prevDay?.v);
  if (v === null || !(v > 0)) return null;
  return v;
}

export function resolveMarketSessionAt(
  ms: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): SessionMetrics["market_session"] {
  const parts = easternParts(ms);
  if (!parts) return "closed";
  const resolved = scheduleOrFallback(ms, schedule);
  if (!resolved) return "closed";
  if (easternDateFromParts(parts) !== resolved.sessionDate) return "closed";
  return sessionKindAtMsOfDay(parts.msOfDay, resolved);
}

export function sessionMetrics(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): SessionMetrics {
  return {
    regular_close: regularClose(t),
    previous_regular_close: previousRegularClose(t),
    regular_change_pct: regularChangePercent(t),
    extended_last: extendedLast(t, referenceMs, schedule),
    after_hours_change_pct: afterHoursChangePercent(t, referenceMs, schedule),
    extended_total_change_pct: extendedTotalChangePercent(t, referenceMs, schedule),
    provider_day_volume: providerDayVolume(t),
    provider_previous_day_volume: providerPreviousDayVolume(t),
    market_session: resolveMarketSessionAt(referenceMs, schedule),
    provider_as_of: providerTimestampMs(t.updated),
  };
}

export type AfterHoursMoverRow = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  regular_close: number;
  extended_last: number;
  after_hours_change_pct: number;
  previous_regular_close: number | null;
  extended_total_change_pct: number | null;
};

/**
 * Build tracked after-hours movers from available snapshot candidates.
 * Reclassifies by after_hours_change_pct — never trusts day gainers/losers lists.
 */
export function classifyTrackedAfterHoursMovers(
  candidates: SnapshotTicker[],
  referenceMs: number = Date.now(),
  schedule?: ResolvedSessionSchedule | null,
): { gainers: AfterHoursMoverRow[]; losers: AfterHoursMoverRow[] } {
  const bySymbol = new Map<string, AfterHoursMoverRow>();

  for (const t of candidates) {
    const symbol = String(t.ticker || t.symbol || "")
      .trim()
      .toUpperCase();
    if (!symbol) continue;

    const metrics = sessionMetrics(t, referenceMs, schedule);
    if (
      metrics.extended_last === null ||
      metrics.regular_close === null ||
      metrics.after_hours_change_pct === null
    ) {
      continue;
    }

    const pct = metrics.after_hours_change_pct;
    if (pct === 0) continue;

    const volume =
      metrics.provider_day_volume !== null && metrics.provider_day_volume > 0
        ? metrics.provider_day_volume
        : finiteNumber(t.min?.av) ?? finiteNumber(t.min?.v) ?? 0;

    const row: AfterHoursMoverRow = {
      symbol,
      name: t.name || t.details?.name || symbol,
      price: metrics.extended_last,
      change: metrics.extended_last - metrics.regular_close,
      changePercent: pct,
      volume,
      regular_close: metrics.regular_close,
      extended_last: metrics.extended_last,
      after_hours_change_pct: pct,
      previous_regular_close: metrics.previous_regular_close,
      extended_total_change_pct: metrics.extended_total_change_pct,
    };

    const prev = bySymbol.get(symbol);
    if (!prev || Math.abs(row.changePercent) > Math.abs(prev.changePercent)) {
      bySymbol.set(symbol, row);
    }
  }

  const all = [...bySymbol.values()];
  const gainers = all
    .filter((r) => r.after_hours_change_pct > 0)
    .sort((a, b) => b.after_hours_change_pct - a.after_hours_change_pct);
  const losers = all
    .filter((r) => r.after_hours_change_pct < 0)
    .sort((a, b) => a.after_hours_change_pct - b.after_hours_change_pct);

  return { gainers, losers };
}
