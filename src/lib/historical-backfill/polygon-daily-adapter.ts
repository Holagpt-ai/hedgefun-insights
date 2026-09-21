/**
 * Polygon/Massive aggregate adapter.
 *
 * Callers pass the existing getAggregates function. This module does not call it
 * by itself, does not read credentials, and does not treat a 365-row page as complete.
 */

import { chunkInclusiveDates, utcDateFromUnixMs } from "@/lib/historical-backfill/dates";
import type {
  DailyBarsRequest,
  DailyBarsResult,
  HistoricalMarketDataProvider,
  ProviderCoverage,
  ProviderDailyBar,
} from "@/types/historical-backfill";

export interface PolygonAggregateFetch {
  (ticker: string, multiplier: number, timespan: string, from: string, to: string): Promise<unknown>;
}

export interface PolygonDailyAdapterOptions {
  fetchAggregates: PolygonAggregateFetch;
  fetchNextPage?: (nextUrl: string) => Promise<unknown>;
  maxDaysPerRequest?: number;
  maxPages?: number;
  sourceAsOf?: string | null;
  fetchedAt?: string | null;
}

interface ParsedPage {
  bars: ProviderDailyBar[];
  nextPageToken: string | null;
  truncated: boolean;
  coverage: ProviderCoverage | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parsePolygonAggregatePage(payload: unknown): ParsedPage {
  if (!isRecord(payload)) {
    return { bars: [], nextPageToken: null, truncated: false, coverage: "UNAVAILABLE", error: "provider payload missing" };
  }
  const coverage = typeof payload.coverage === "string" ? payload.coverage as ProviderCoverage : null;
  const error = typeof payload.error === "string" ? payload.error : null;
  const nextPageToken = typeof payload.next_url === "string" && payload.next_url.length > 0 ? payload.next_url : null;
  const results = Array.isArray(payload.results) ? payload.results : [];
  const bars: ProviderDailyBar[] = [];
  for (const row of results) {
    if (!isRecord(row) || typeof row.t !== "number") continue;
    const sessionDate = utcDateFromUnixMs(row.t);
    if (!sessionDate) continue;
    bars.push({
      sessionDate,
      open: finiteOrNull(row.o),
      high: finiteOrNull(row.h),
      low: finiteOrNull(row.l),
      close: finiteOrNull(row.c),
      volume: finiteOrNull(row.v),
    });
  }
  const truncated = nextPageToken === null && results.length >= 365;
  return { bars, nextPageToken, truncated, coverage, error };
}

export function createPolygonDailyAdapter(options: PolygonDailyAdapterOptions): HistoricalMarketDataProvider {
  const maxDays = options.maxDaysPerRequest ?? 120;
  const maxPages = options.maxPages ?? 20;

  return {
    async fetchDailyBars(request: DailyBarsRequest): Promise<DailyBarsResult> {
      const chunks = chunkInclusiveDates(request.dateFrom, request.dateTo, maxDays);
      const bars: ProviderDailyBar[] = [];
      let coverage: ProviderCoverage = "SUPPORTED";
      let error: string | null = null;
      for (const chunk of chunks) {
        let nextPageToken: string | null = null;
        let page = 0;
        do {
          page += 1;
          if (page > maxPages) {
            coverage = "PARTIAL";
            error = "provider page limit reached";
            break;
          }
          const payload = nextPageToken
            ? await options.fetchNextPage?.(nextPageToken)
            : await options.fetchAggregates(request.symbol, 1, "day", chunk.dateFrom, chunk.dateTo);
          if (nextPageToken && !options.fetchNextPage) {
            coverage = "PARTIAL";
            error = "provider returned another page but no page fetcher is configured";
            break;
          }
          const parsed = parsePolygonAggregatePage(payload);
          bars.push(...parsed.bars);
          if (parsed.coverage && parsed.coverage !== "SUPPORTED") coverage = parsed.coverage;
          if (parsed.error) error = parsed.error;
          if (parsed.truncated) coverage = coverage === "SUPPORTED" ? "PARTIAL" : coverage;
          nextPageToken = parsed.nextPageToken;
        } while (nextPageToken && coverage === "SUPPORTED");
        if (coverage !== "SUPPORTED") break;
      }
      return {
        coverage,
        bars,
        source: "polygon-aggregates",
        sourceAsOf: options.sourceAsOf ?? null,
        fetchedAt: options.fetchedAt ?? null,
        error,
        complete: coverage === "SUPPORTED",
      };
    },
  };
}
