/**
 * Close-to-close ETF price returns from normalized daily bars.
 * Missing boundaries stay null. Benchmark returns exist only when a
 * separate observed series has the same valid start and end.
 */

import { getEtParts, isTradingDay } from "@/lib/market-calendar";
import { getAggregates } from "@/lib/polygon";
import { normalizeAggregateBars, type NormalizedBar } from "@/lib/stock-chart/normalize-bars";

export const PERFORMANCE_PERIODS = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

/** Weekend plus a holiday closure. Wider gaps are not a period boundary. */
const MAX_BOUNDARY_GAP_DAYS = 7;
/** Max missing US equity sessions allowed between consecutive daily observations. */
const MAX_INTERNAL_TRADING_GAP = 7;

export interface PeriodPriceReturn {
  period: PerformancePeriod;
  /** Null when a valid start or end observation is missing. Never a stand-in zero. */
  displayPercent: number | null;
  kind: "price";
  startObservedAt: string | null;
  endObservedAt: string | null;
  benchmarkDisplayPercent: number | null;
  benchmarkName: string | null;
}

export interface EtfPerformanceModel {
  returnKind: "price";
  periods: PeriodPriceReturn[];
  hasAnyEtfReturn: boolean;
  hasAnyBenchmarkReturn: boolean;
}

export interface BenchmarkObservations {
  name: string;
  bars: NormalizedBar[];
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const monthIndex = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return new Date(Date.UTC(y, monthIndex, day)).toISOString().slice(0, 10);
}

function daysBetween(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00.000Z`);
  const end = Date.parse(`${later}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export function etAsOfDate(now: Date): string {
  return getEtParts(now).date;
}

/** Daily history window covering 5Y plus a short anchor buffer. */
export function etfDailyHistoryRange(now = new Date()): {
  from: string;
  to: string;
  multiplier: 1;
  timespan: "day";
} {
  const to = etAsOfDate(now);
  const from = addDays(addMonths(to, -60), -14);
  return { from, to, multiplier: 1, timespan: "day" };
}

export function periodBoundaryDate(period: PerformancePeriod, now: Date): string {
  const today = etAsOfDate(now);
  switch (period) {
    case "1M":
      return addMonths(today, -1);
    case "3M":
      return addMonths(today, -3);
    case "6M":
      return addMonths(today, -6);
    case "YTD":
      return `${today.slice(0, 4)}-01-01`;
    case "1Y":
      return addMonths(today, -12);
    case "3Y":
      return addMonths(today, -36);
    case "5Y":
      return addMonths(today, -60);
    default:
      return today;
  }
}

function sessionDate(bar: NormalizedBar): string {
  return new Date(bar.utcMs).toISOString().slice(0, 10);
}

function usableBars(bars: NormalizedBar[]): NormalizedBar[] {
  const bySession = new Map<string, NormalizedBar>();
  for (const bar of bars) {
    if (!Number.isFinite(bar.utcMs) || !Number.isFinite(bar.close) || !(bar.close > 0)) continue;
    const date = sessionDate(bar);
    const prev = bySession.get(date);
    if (!prev || bar.utcMs >= prev.utcMs) bySession.set(date, bar);
  }
  return [...bySession.values()].sort((a, b) => a.utcMs - b.utcMs);
}

export function roundPriceReturn(percent: number): number {
  return Math.round(percent * 10) / 10;
}

export function formatPriceReturn(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return "Unavailable";
  const rounded = roundPriceReturn(percent);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

/**
 * Price return from the last close before `boundary` to the last close on or before `asOf`.
 * Both observations must sit within a trading-calendar gap of the requested boundary.
 */
export function closeToClosePriceReturn(
  bars: NormalizedBar[],
  boundary: string,
  asOf: string,
): { displayPercent: number; startObservedAt: string; endObservedAt: string } | null {
  const sorted = usableBars(bars);
  let anchor: NormalizedBar | null = null;
  for (const bar of sorted) {
    const date = sessionDate(bar);
    if (date < boundary) anchor = bar;
    else break;
  }
  if (!anchor) return null;
  const anchorDate = sessionDate(anchor);
  if (daysBetween(anchorDate, boundary) > MAX_BOUNDARY_GAP_DAYS) return null;

  let end: NormalizedBar | null = null;
  for (const bar of sorted) {
    const date = sessionDate(bar);
    if (date >= boundary && date <= asOf) end = bar;
  }
  if (!end || end.utcMs <= anchor.utcMs) return null;
  const endDate = sessionDate(end);
  if (daysBetween(endDate, asOf) > MAX_BOUNDARY_GAP_DAYS) return null;

  const percent = ((end.close - anchor.close) / anchor.close) * 100;
  if (!Number.isFinite(percent)) return null;
  return {
    displayPercent: roundPriceReturn(percent),
    startObservedAt: new Date(anchor.utcMs).toISOString(),
    endObservedAt: new Date(end.utcMs).toISOString(),
  };
}

export function priceReturnForPeriod(
  bars: NormalizedBar[],
  period: PerformancePeriod,
  now: Date,
): { displayPercent: number; startObservedAt: string; endObservedAt: string } | null {
  return closeToClosePriceReturn(bars, periodBoundaryDate(period, now), etAsOfDate(now));
}

export function buildEtfPerformance(
  etfBars: NormalizedBar[],
  benchmark: BenchmarkObservations | null,
  now = new Date(),
): EtfPerformanceModel {
  const benchmarkName = benchmark?.name?.trim() ? benchmark.name.trim() : null;
  const periods = PERFORMANCE_PERIODS.map((period) => {
    const etf = priceReturnForPeriod(etfBars, period, now);
    const observedBenchmark =
      benchmark && benchmarkName
        ? priceReturnForPeriod(benchmark.bars, period, now)
        : null;
    return {
      period,
      displayPercent: etf?.displayPercent ?? null,
      kind: "price" as const,
      startObservedAt: etf?.startObservedAt ?? null,
      endObservedAt: etf?.endObservedAt ?? null,
      benchmarkDisplayPercent: observedBenchmark?.displayPercent ?? null,
      benchmarkName: observedBenchmark ? benchmarkName : null,
    };
  });

  return {
    returnKind: "price",
    periods,
    hasAnyEtfReturn: periods.some((period) => period.displayPercent !== null),
    hasAnyBenchmarkReturn: periods.some((period) => period.benchmarkDisplayPercent !== null),
  };
}

export type ObservedPriceRangeCoverage = "fifty_two_week" | "since_inception" | "observed_window";

export interface ObservedPriceRange {
  coverage: ObservedPriceRangeCoverage;
  high: number;
  low: number;
  fromDate: string;
  toDate: string;
  inceptionDate?: string;
}

function computeWindowHighLow(window: NormalizedBar[]): { high: number; low: number } | null {
  if (window.length === 0) return null;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (const bar of window) {
    if (!Number.isFinite(bar.high) || !Number.isFinite(bar.low) || !(bar.high > 0) || !(bar.low > 0)) {
      return null;
    }
    if (bar.high < bar.low) return null;
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
  }
  if (!Number.isFinite(high) || !Number.isFinite(low) || high < low) return null;
  return { high, low };
}

function utcWeekday(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
}

/** US equity sessions between `from` and `to`, inclusive, using the normalized daily bar date contract. */
export function listTradingSessionDates(from: string, to: string): string[] {
  if (from > to) return [];
  const sessions: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    if (isTradingDay(cursor, utcWeekday(cursor))) sessions.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return sessions;
}

/** Largest run of eligible sessions missing between consecutive observed daily bars. */
export function largestInternalTradingGap(sortedSessionDates: string[]): number {
  if (sortedSessionDates.length < 2) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (let index = 1; index < sortedSessionDates.length; index += 1) {
    const span = listTradingSessionDates(sortedSessionDates[index - 1], sortedSessionDates[index]);
    const missingBetween = Math.max(0, span.length - 2);
    worst = Math.max(worst, missingBetween);
  }
  return worst;
}

export function hasAdequateDailySessionCoverage(sortedSessionDates: string[]): boolean {
  return sortedSessionDates.length >= 2
    && largestInternalTradingGap(sortedSessionDates) <= MAX_INTERNAL_TRADING_GAP;
}

function parseInceptionIso(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const date = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

/**
 * High/low extremes with coverage that matches the label.
 * Full-year labels require an observation near the 52-week window start.
 */
export function observedPriceRange(
  bars: NormalizedBar[],
  now = new Date(),
  inceptionDate: string | null = null,
): ObservedPriceRange | null {
  const asOf = etAsOfDate(now);
  const start52 = addDays(asOf, -365);
  const window = usableBars(bars).filter((bar) => {
    const date = sessionDate(bar);
    return date >= start52 && date <= asOf;
  });
  if (window.length === 0) return null;

  const latest = window[window.length - 1];
  if (daysBetween(sessionDate(latest), asOf) > MAX_BOUNDARY_GAP_DAYS) return null;

  const extremes = computeWindowHighLow(window);
  if (!extremes) return null;

  const earliestDate = sessionDate(window[0]);
  const latestDate = sessionDate(latest);
  const inception = parseInceptionIso(inceptionDate);
  const observedSessionDates = window.map((bar) => sessionDate(bar));
  const continuousCoverage = hasAdequateDailySessionCoverage(observedSessionDates);

  const partialRange = (): ObservedPriceRange => ({
    coverage: "observed_window",
    high: extremes.high,
    low: extremes.low,
    fromDate: earliestDate,
    toDate: latestDate,
  });

  if (!continuousCoverage) return partialRange();

  if (daysBetween(start52, earliestDate) <= MAX_BOUNDARY_GAP_DAYS) {
    return {
      coverage: "fifty_two_week",
      high: extremes.high,
      low: extremes.low,
      fromDate: earliestDate,
      toDate: latestDate,
    };
  }

  if (
    inception
    && earliestDate >= inception
    && daysBetween(inception, earliestDate) <= MAX_BOUNDARY_GAP_DAYS
  ) {
    return {
      coverage: "since_inception",
      high: extremes.high,
      low: extremes.low,
      fromDate: earliestDate,
      toDate: latestDate,
      inceptionDate: inception,
    };
  }

  return partialRange();
}

/** @deprecated Use observedPriceRange — only returns values when full 52-week coverage is verified. */
export function fiftyTwoWeekPrices(
  bars: NormalizedBar[],
  now = new Date(),
): { high: number; low: number } | null {
  const range = observedPriceRange(bars, now, null);
  if (!range || range.coverage !== "fifty_two_week") return null;
  return { high: range.high, low: range.low };
}

export async function loadEtfDailyBars(symbol: string, now = new Date()): Promise<NormalizedBar[]> {
  const range = etfDailyHistoryRange(now);
  const payload = await getAggregates(symbol, range.multiplier, range.timespan, range.from, range.to);
  const raw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
      ? (payload as { results: unknown[] }).results
      : payload;
  return normalizeAggregateBars(raw);
}
