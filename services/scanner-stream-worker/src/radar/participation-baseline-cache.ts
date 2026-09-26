/**
 * Session-aware cumulative participation baselines from Polygon 5m history.
 * Non-blocking warm(); get() is synchronous and returns null until ready.
 *
 * Cache key: `${INTRADAY_PARTICIPATION_CACHE_VERSION}|${tradingDate}|${symbol}`
 * Lifetime: until surveillance tradingDate changes or LRU eviction at max symbols.
 */

import { weekdayDatesInclusive } from "../../../../supabase/functions/_shared/markets/baseline-window.ts";
import {
  type CalendarExceptionRow,
  type ResolvedSessionSchedule,
  type SessionKind,
  easternParts,
  resolveScheduleAt,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  INTRADAY_PARTICIPATION_CACHE_MAX_SYMBOLS,
  INTRADAY_PARTICIPATION_LOOKBACK_CALENDAR_DAYS,
  INTRADAY_PARTICIPATION_MIN_BASELINE_SESSIONS,
  INTRADAY_PARTICIPATION_TARGET_BASELINE_SESSIONS,
  INTRADAY_PARTICIPATION_CACHE_VERSION,
} from "../../../../src/config/intraday-participation.config.ts";
import {
  baselineSufficiency,
  detectBaselineCorporateActionAnomaly,
  type CumulativeBaselineSnapshot,
} from "../../../../src/lib/radar/intraday-participation.ts";
import { radarSessionKindAtMsOfDay } from "./session.ts";
import { RVOL_5M_FETCH_CONCURRENCY } from "./momentum-metrics.config.ts";

type FetchLike = typeof fetch;

type PolygonAggBar = {
  t: number;
  v: number;
  c?: number;
};

type SymbolEntry = {
  tradingDate: string;
  /** `${date}|${sessionKind}` → msOfDay → cumulative volume that day */
  cumByDayKind: Map<string, Map<number, number>>;
  invalid: boolean;
};

export type ParticipationBaselineCache = {
  get(
    symbol: string,
    tradingDate: string,
    sessionKind: SessionKind,
    msOfDay: number,
  ): CumulativeBaselineSnapshot | null;
  warm(symbols: readonly string[], tradingDate: string): Promise<void>;
  clear(): void;
  cacheKey(symbol: string, tradingDate: string): string;
};

function tradingDatesLookback(tradingDate: string): string[] {
  const end = new Date(`${tradingDate}T12:00:00Z`);
  const start = new Date(
    end.getTime() - INTRADAY_PARTICIPATION_LOOKBACK_CALENDAR_DAYS * 86400_000,
  );
  const startIso = start.toISOString().slice(0, 10);
  return weekdayDatesInclusive(startIso, tradingDate).filter((d) => d < tradingDate);
}

async function fetch5mHistory(
  symbol: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
  fetchFn: FetchLike,
): Promise<PolygonAggBar[]> {
  const url = new URL(
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/5/minute/${fromDate}/${toDate}`,
  );
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  url.searchParams.set("apiKey", apiKey);
  const res = await fetchFn(url.toString());
  if (!res.ok) return [];
  const json = await res.json() as { results?: PolygonAggBar[] };
  return json.results ?? [];
}

function finiteClose(c: number | undefined): c is number {
  return c !== undefined && Number.isFinite(c) && c > 0;
}

function buildSessionCumulativeProfiles(
  bars: PolygonAggBar[],
  scheduleFor: (ms: number) => ResolvedSessionSchedule | null,
  tradingDate: string,
): { cumByDayKind: Map<string, Map<number, number>>; closes: number[]; invalid: boolean } {
  const closes: number[] = [];
  const cumByDayKind = new Map<string, Map<number, number>>();

  for (const bar of bars) {
    if (!(bar.v > 0) || !Number.isFinite(bar.v)) continue;
    const parts = easternParts(bar.t);
    const schedule = scheduleFor(bar.t);
    if (!parts || !schedule || parts.date >= tradingDate) continue;
    const kind = radarSessionKindAtMsOfDay(parts.msOfDay, schedule);
    if (kind === "closed") continue;
    if (finiteClose(bar.c)) closes.push(bar.c);
    const dk = `${parts.date}|${kind}`;
    let dayMap = cumByDayKind.get(dk);
    if (!dayMap) {
      dayMap = new Map();
      cumByDayKind.set(dk, dayMap);
    }
    const slots = [...dayMap.entries()].filter(([slot]) => slot < parts.msOfDay);
    const lastCum = slots.length > 0
      ? slots.sort((a, b) => a[0] - b[0]).at(-1)?.[1] ?? 0
      : 0;
    dayMap.set(parts.msOfDay, lastCum + bar.v);
  }

  const invalid = detectBaselineCorporateActionAnomaly(closes);
  return { cumByDayKind, closes, invalid };
}

function cumulativeAvgAtMsOfDay(
  cumByDayKind: Map<string, Map<number, number>>,
  sessionKind: SessionKind,
  msOfDay: number,
): { avg: number; count: number } | null {
  const samples: number[] = [];
  for (const [dk, dayMap] of cumByDayKind) {
    if (!dk.endsWith(`|${sessionKind}`)) continue;
    const slots = [...dayMap.entries()].filter(([slot]) => slot <= msOfDay);
    if (slots.length === 0) continue;
    const cum = slots.sort((a, b) => a[0] - b[0]).at(-1)?.[1];
    if (cum !== undefined && cum > 0) samples.push(cum);
  }
  if (samples.length === 0) return null;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { avg, count: samples.length };
}

export function createParticipationBaselineCache(opts: {
  apiKey: string;
  fetch: FetchLike;
  exceptions: () => CalendarExceptionRow[] | null;
}): ParticipationBaselineCache {
  const entries = new Map<string, SymbolEntry>();
  const inFlight = new Map<string, Promise<void>>();
  let activeTradingDate: string | null = null;

  function scheduleFor(ms: number): ResolvedSessionSchedule | null {
    return resolveScheduleAt(ms, opts.exceptions());
  }

  function cacheKey(symbol: string, tradingDate: string): string {
    return `${INTRADAY_PARTICIPATION_CACHE_VERSION}|${tradingDate}|${symbol.toUpperCase()}`;
  }

  function touch(key: string, entry: SymbolEntry): void {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > INTRADAY_PARTICIPATION_CACHE_MAX_SYMBOLS) {
      const first = entries.keys().next().value;
      if (!first) break;
      entries.delete(first);
    }
  }

  async function warmOne(symbol: string, tradingDate: string): Promise<void> {
    const sym = symbol.toUpperCase();
    const key = cacheKey(sym, tradingDate);
    if (entries.has(key)) return;
    const dates = tradingDatesLookback(tradingDate);
    if (dates.length === 0) return;
    const bars = await fetch5mHistory(
      sym,
      dates[0]!,
      dates[dates.length - 1]!,
      opts.apiKey,
      opts.fetch,
    );
    const built = buildSessionCumulativeProfiles(bars, scheduleFor, tradingDate);
    touch(key, {
      tradingDate,
      cumByDayKind: built.cumByDayKind,
      invalid: built.invalid,
    });
  }

  return {
    cacheKey,
    clear() {
      entries.clear();
      inFlight.clear();
      activeTradingDate = null;
    },
    get(symbol, tradingDate, sessionKind, msOfDay) {
      if (sessionKind === "closed") return null;
      const key = cacheKey(symbol, tradingDate);
      const entry = entries.get(key);
      if (!entry || entry.tradingDate !== tradingDate) return null;
      if (entry.invalid) {
        return {
          avgCumulativeVolume: 0,
          historicalSessionCount: 0,
          targetSessionCount: INTRADAY_PARTICIPATION_TARGET_BASELINE_SESSIONS,
          sufficient: false,
          invalid: true,
        };
      }
      const snap = cumulativeAvgAtMsOfDay(entry.cumByDayKind, sessionKind, msOfDay);
      if (!snap) return null;
      const sufficient = baselineSufficiency(
        snap.count,
        INTRADAY_PARTICIPATION_MIN_BASELINE_SESSIONS,
      );
      return {
        avgCumulativeVolume: snap.avg,
        historicalSessionCount: snap.count,
        targetSessionCount: INTRADAY_PARTICIPATION_TARGET_BASELINE_SESSIONS,
        sufficient,
        invalid: false,
      };
    },
    async warm(symbols, tradingDate) {
      if (activeTradingDate !== tradingDate) {
        entries.clear();
        inFlight.clear();
        activeTradingDate = tradingDate;
      }
      const queue = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
      let index = 0;
      async function worker(): Promise<void> {
        while (index < queue.length) {
          const sym = queue[index++]!;
          const key = cacheKey(sym, tradingDate);
          if (entries.has(key)) continue;
          const pending = inFlight.get(key);
          if (pending) {
            await pending;
            continue;
          }
          const job = warmOne(sym, tradingDate).finally(() => inFlight.delete(key));
          inFlight.set(key, job);
          await job;
        }
      }
      const workers = Array.from(
        { length: Math.min(RVOL_5M_FETCH_CONCURRENCY, queue.length || 1) },
        () => worker(),
      );
      await Promise.all(workers);
    },
  };
}
