import type { OHLCVData } from "@/components/charts/TradingViewChart";
import type { ChartGranularity } from "./chart-ranges";

export interface RawAggregateBar {
  t?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
}

export interface NormalizedBar {
  utcMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function isValidBar(bar: RawAggregateBar): boolean {
  const fields = [bar.o, bar.h, bar.l, bar.c];
  if (typeof bar.t !== "number" || !Number.isFinite(bar.t)) return false;
  if (!fields.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)) return false;
  if (bar.h! < bar.l!) return false;
  if (bar.h! < Math.max(bar.o!, bar.c!) || bar.l! > Math.min(bar.o!, bar.c!)) return false;
  const vol = bar.v ?? 0;
  if (typeof vol !== "number" || !Number.isFinite(vol) || vol < 0) return false;
  return true;
}

/** Dedupe by UTC ms (last wins), drop invalid rows, sort ascending. */
export function normalizeAggregateBars(raw: unknown): NormalizedBar[] {
  if (!Array.isArray(raw)) return [];
  const byTime = new Map<number, NormalizedBar>();
  for (const row of raw) {
    const bar = row as RawAggregateBar;
    if (!isValidBar(bar)) continue;
    byTime.set(bar.t!, {
      utcMs: bar.t!,
      open: bar.o!,
      high: bar.h!,
      low: bar.l!,
      close: bar.c!,
      volume: bar.v ?? 0,
    });
  }
  return [...byTime.values()].sort((a, b) => a.utcMs - b.utcMs);
}

function dailyBarTime(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** Map normalized bars to lightweight-charts OHLCV contract. */
export function toOhlcvSeries(bars: NormalizedBar[], granularity: ChartGranularity): OHLCVData[] {
  return bars.map((bar) => ({
    time: granularity === "intraday" ? Math.floor(bar.utcMs / 1000) : dailyBarTime(bar.utcMs),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

export interface ChartSeriesMeta {
  granularity: ChartGranularity;
  barCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  usesPriorSessionFallback: boolean;
}

export function chartSeriesMeta(
  bars: NormalizedBar[],
  granularity: ChartGranularity,
  usesPriorSessionFallback = false,
): ChartSeriesMeta {
  if (bars.length === 0) {
    return {
      granularity,
      barCount: 0,
      firstObservedAt: null,
      lastObservedAt: null,
      usesPriorSessionFallback,
    };
  }
  return {
    granularity,
    barCount: bars.length,
    firstObservedAt: new Date(bars[0].utcMs).toISOString(),
    lastObservedAt: new Date(bars[bars.length - 1].utcMs).toISOString(),
    usesPriorSessionFallback,
  };
}
