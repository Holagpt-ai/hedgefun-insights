/**
 * Explicit market-session field helpers.
 * Day-session surfaces must pair regular_close with regular_change_pct.
 * After-hours surfaces must pair extended_last with after_hours_change_pct.
 * Never pair day.c with todaysChangePerc.
 */

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

/** After-hours window in Eastern minutes from midnight: 16:00–20:00 inclusive. */
export const AFTER_HOURS_START_MINS = 16 * 60;
export const AFTER_HOURS_END_MINS = 20 * 60;

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

/** Convert Polygon timestamps (ns or ms) to epoch ms. */
export function providerTimestampMs(raw: unknown): number | null {
  const n = finiteNumber(raw);
  if (n === null || !(n > 0)) return null;
  // Nanoseconds are >> 1e14; milliseconds for current era are ~1e12–1e13.
  if (n > 1e14) return Math.trunc(n / 1_000_000);
  return Math.trunc(n);
}

/** Eastern-time calendar parts for a UTC epoch ms. */
export function easternParts(ms: number): {
  year: number;
  month: number;
  day: number;
  mins: number;
} | null {
  if (!Number.isFinite(ms)) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  const minute = Number(get("minute"));
  // Some engines emit hour "24" for midnight.
  if (hour === 24) hour = 0;
  if (![year, month, day, hour, minute].every((v) => Number.isFinite(v))) {
    return null;
  }
  return { year, month, day, mins: hour * 60 + minute };
}

export function isAfterHoursTimestamp(
  rawTs: unknown,
  referenceMs: number = Date.now(),
): boolean {
  const tradeMs = providerTimestampMs(rawTs);
  if (tradeMs === null) return false;
  const trade = easternParts(tradeMs);
  const ref = easternParts(referenceMs);
  if (!trade || !ref) return false;
  // Must be the same Eastern calendar day as the observation reference.
  if (
    trade.year !== ref.year ||
    trade.month !== ref.month ||
    trade.day !== ref.day
  ) {
    return false;
  }
  return (
    trade.mins >= AFTER_HOURS_START_MINS && trade.mins <= AFTER_HOURS_END_MINS
  );
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
 * Verified extended-hours last: lastTrade.p or min.c only when the timestamp
 * falls in the Eastern after-hours window. Never falls back to day.c.
 */
export function extendedLast(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
): number | null {
  const lastPx = finitePositive(t?.lastTrade?.p);
  if (lastPx !== null && isAfterHoursTimestamp(t?.lastTrade?.t, referenceMs)) {
    return lastPx;
  }
  const minPx = finitePositive(t?.min?.c);
  if (minPx !== null && isAfterHoursTimestamp(t?.min?.t, referenceMs)) {
    return minPx;
  }
  return null;
}

export function afterHoursChangePercent(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
): number | null {
  const last = extendedLast(t, referenceMs);
  const close = regularClose(t);
  if (last === null || close === null) return null;
  const pct = ((last - close) / close) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function extendedTotalChangePercent(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
): number | null {
  const last = extendedLast(t, referenceMs);
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
): SessionMetrics["market_session"] {
  const parts = easternParts(ms);
  if (!parts) return "closed";
  const { mins } = parts;
  if (mins >= 240 && mins < 570) return "pre-market";
  if (mins >= 570 && mins <= 960) return "market";
  if (mins >= 961 && mins <= 1200) return "after-hours";
  return "closed";
}

export function sessionMetrics(
  t: SnapshotTicker,
  referenceMs: number = Date.now(),
): SessionMetrics {
  return {
    regular_close: regularClose(t),
    previous_regular_close: previousRegularClose(t),
    regular_change_pct: regularChangePercent(t),
    extended_last: extendedLast(t, referenceMs),
    after_hours_change_pct: afterHoursChangePercent(t, referenceMs),
    extended_total_change_pct: extendedTotalChangePercent(t, referenceMs),
    provider_day_volume: providerDayVolume(t),
    provider_previous_day_volume: providerPreviousDayVolume(t),
    market_session: resolveMarketSessionAt(referenceMs),
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
): { gainers: AfterHoursMoverRow[]; losers: AfterHoursMoverRow[] } {
  const bySymbol = new Map<string, AfterHoursMoverRow>();

  for (const t of candidates) {
    const symbol = String(t.ticker || t.symbol || "")
      .trim()
      .toUpperCase();
    if (!symbol) continue;

    const metrics = sessionMetrics(t, referenceMs);
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
