import { weekdayDatesInclusive } from "../../../../supabase/functions/_shared/markets/baseline-window.ts";
import {
  type CalendarExceptionRow,
  type ResolvedSessionSchedule,
  resolveScheduleAt,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  RVOL_5M_FETCH_CONCURRENCY,
  RVOL_5M_LOOKBACK_CALENDAR_DAYS,
  RVOL_5M_MIN_TOD_SAMPLES,
} from "./momentum-metrics.config.ts";
import { regularSessionBucketIndex, type TodBucketBaseline } from "./momentum-metrics.ts";

type FetchLike = typeof fetch;

type PolygonAggBar = {
  t: number;
  v: number;
};

export type Tod5mBaselineCache = {
  get(symbol: string, bucketIndex: number): TodBucketBaseline | null;
  warm(symbols: readonly string[], tradingDate: string): Promise<void>;
};

type SymbolProfile = Map<number, { sum: number; count: number }>;

function tradingDatesLookback(tradingDate: string): string[] {
  const end = new Date(`${tradingDate}T12:00:00Z`);
  const start = new Date(end.getTime() - RVOL_5M_LOOKBACK_CALENDAR_DAYS * 86400_000);
  const startIso = start.toISOString().slice(0, 10);
  return weekdayDatesInclusive(startIso, tradingDate).filter((d) => d < tradingDate);
}

function buildProfileFromBars(
  bars: PolygonAggBar[],
  scheduleForBar: (ms: number) => ResolvedSessionSchedule | null,
): SymbolProfile {
  const profile: SymbolProfile = new Map();
  for (const bar of bars) {
    if (!(bar.v > 0) || !Number.isFinite(bar.v)) continue;
    const schedule = scheduleForBar(bar.t);
    if (!schedule) continue;
    const bucket = regularSessionBucketIndex(bar.t, schedule);
    if (bucket === null) continue;
    const entry = profile.get(bucket) ?? { sum: 0, count: 0 };
    entry.sum += bar.v;
    entry.count += 1;
    profile.set(bucket, entry);
  }
  return profile;
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

export function createTod5mBaselineCache(opts: {
  apiKey: string;
  fetch: FetchLike;
  exceptions: () => CalendarExceptionRow[] | null;
}): Tod5mBaselineCache {
  const bySymbol = new Map<string, SymbolProfile>();
  const inFlight = new Map<string, Promise<void>>();

  function scheduleFor(ms: number): ResolvedSessionSchedule | null {
    return resolveScheduleAt(ms, opts.exceptions());
  }

  function get(symbol: string, bucketIndex: number): TodBucketBaseline | null {
    const profile = bySymbol.get(symbol);
    if (!profile) return null;
    const entry = profile.get(bucketIndex);
    if (!entry || entry.count < RVOL_5M_MIN_TOD_SAMPLES) return null;
    const expectedVolume = entry.sum / entry.count;
    if (!(expectedVolume > 0) || !Number.isFinite(expectedVolume)) return null;
    return { expectedVolume, sampleCount: entry.count };
  }

  async function warmOne(symbol: string, tradingDate: string): Promise<void> {
    const dates = tradingDatesLookback(tradingDate);
    if (dates.length === 0) return;
    const fromDate = dates[0]!;
    const toDate = dates[dates.length - 1]!;
    const bars = await fetch5mHistory(symbol, fromDate, toDate, opts.apiKey, opts.fetch);
    if (bars.length === 0) return;
    const profile = buildProfileFromBars(bars, scheduleFor);
    if (profile.size === 0) return;
    bySymbol.set(symbol, profile);
  }

  async function warm(symbols: readonly string[], tradingDate: string): Promise<void> {
    const queue = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    let index = 0;
    async function worker(): Promise<void> {
      while (index < queue.length) {
        const sym = queue[index++]!;
        if (bySymbol.has(sym)) continue;
        const pending = inFlight.get(sym);
        if (pending) {
          await pending;
          continue;
        }
        const job = warmOne(sym, tradingDate).finally(() => {
          inFlight.delete(sym);
        });
        inFlight.set(sym, job);
        await job;
      }
    }
    const workers = Array.from(
      { length: Math.min(RVOL_5M_FETCH_CONCURRENCY, queue.length || 1) },
      () => worker(),
    );
    await Promise.all(workers);
  }

  return { get, warm };
}
