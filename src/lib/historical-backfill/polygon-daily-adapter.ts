/**
 * Polygon/Massive aggregate adapter.
 *
 * Callers pass the existing getAggregates function. This module does not call it
 * by itself, does not read credentials, and does not treat a 365-row page as complete.
 */

import { chunkInclusiveDates, utcDateFromUnixMs } from "@/lib/historical-backfill/dates";
import {
  classifyPolygonAggregateResponse,
  sanitizeProviderDiagnostics,
  type ProviderFailureKind,
} from "@/lib/historical-backfill/provider-failure";
import type {
  DailyBarsRequest,
  DailyBarsResult,
  HistoricalMarketDataProvider,
  ProviderCoverage,
  ProviderDailyBar,
} from "@/types/historical-backfill";

export interface PolygonAggregateFetchResult {
  httpStatus: number;
  body: unknown;
}

export interface PolygonAggregateFetch {
  (ticker: string, multiplier: number, timespan: string, from: string, to: string): Promise<PolygonAggregateFetchResult>;
}

export interface PolygonDailyAdapterOptions {
  fetchAggregates: PolygonAggregateFetch;
  fetchNextPage?: (nextUrl: string) => Promise<PolygonAggregateFetchResult>;
  /**
   * When omitted, the requested from/to span is one provider call.
   * Set this to the conservative fallback when a provider must be chunked.
   */
  maxDaysPerRequest?: number;
  /** Requests that start before this date are incomplete and are not sent. */
  verifiedEarliestDailyDate?: string | null;
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
  const providerStatus = typeof payload.status === "string" ? payload.status : null;
  const providerMessage = typeof payload.message === "string" ? payload.message : null;
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
  const queryCount = typeof payload.queryCount === "number" ? payload.queryCount : null;
  const resultsCount = typeof payload.resultsCount === "number" ? payload.resultsCount : null;
  const countedComplete = queryCount !== null && resultsCount !== null && results.length >= queryCount;
  const truncated = nextPageToken === null && !countedComplete && results.length >= 365;
  let pageCoverage = coverage;
  let pageError = error;
  if (providerStatus === "NOT_AUTHORIZED") {
    pageCoverage = "UNAVAILABLE";
    pageError = pageError ?? providerMessage ?? "provider not authorized";
  }
  return { bars, nextPageToken, truncated, coverage: pageCoverage, error: pageError };
}

function providerTransportError(kind: ProviderFailureKind, httpStatus: number): Error {
  return new Error(`provider transport failure ${kind} HTTP ${httpStatus}`);
}

export function createPolygonDailyAdapter(options: PolygonDailyAdapterOptions): HistoricalMarketDataProvider {
  const maxDays = options.maxDaysPerRequest;
  const maxPages = options.maxPages ?? 20;
  const earliest = options.verifiedEarliestDailyDate ?? null;

  return {
    async fetchDailyBars(request: DailyBarsRequest): Promise<DailyBarsResult> {
      if (earliest && request.dateFrom < earliest) {
        return {
          coverage: "UNAVAILABLE",
          bars: [],
          source: "polygon-aggregates",
          sourceAsOf: options.sourceAsOf ?? null,
          fetchedAt: options.fetchedAt ?? null,
          error: `daily request starts before verified entitlement ${earliest}`,
          complete: false,
          failureKind: null,
          providerDiagnostics: null,
        };
      }
      const chunks = maxDays == null
        ? [{ dateFrom: request.dateFrom, dateTo: request.dateTo }]
        : chunkInclusiveDates(request.dateFrom, request.dateTo, maxDays);
      const bars: ProviderDailyBar[] = [];
      let coverage: ProviderCoverage = "SUPPORTED";
      let error: string | null = null;
      let failureKind: ProviderFailureKind | null = null;
      let providerDiagnostics: ReturnType<typeof sanitizeProviderDiagnostics> | null = null;
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
          const fetched = nextPageToken
            ? await options.fetchNextPage?.(nextPageToken)
            : await options.fetchAggregates(request.symbol, 1, "day", chunk.dateFrom, chunk.dateTo);
          if (nextPageToken && !options.fetchNextPage) {
            coverage = "PARTIAL";
            error = "provider returned another page but no page fetcher is configured";
            break;
          }
          if (!fetched) {
            coverage = "UNAVAILABLE";
            error = "provider page fetch missing";
            break;
          }
          const classified = classifyPolygonAggregateResponse(fetched.httpStatus, fetched.body);
          if (classified === "PROVIDER_RATE_LIMIT" || classified === "PROVIDER_RETRYABLE") {
            throw providerTransportError(classified, fetched.httpStatus);
          }
          if (classified) {
            failureKind = classified;
            providerDiagnostics = sanitizeProviderDiagnostics(fetched.httpStatus, fetched.body);
            coverage = "UNAVAILABLE";
            error = providerDiagnostics.providerMessage ?? classified;
            break;
          }
          const parsed = parsePolygonAggregatePage(fetched.body);
          bars.push(...parsed.bars);
          if (parsed.coverage && parsed.coverage !== "SUPPORTED") coverage = parsed.coverage;
          if (parsed.error) error = parsed.error;
          if (parsed.truncated) coverage = coverage === "SUPPORTED" ? "PARTIAL" : coverage;
          nextPageToken = parsed.nextPageToken;
        } while (nextPageToken && coverage === "SUPPORTED" && !failureKind);
        if (coverage !== "SUPPORTED" || failureKind) break;
      }
      return {
        coverage,
        bars,
        source: "polygon-aggregates",
        sourceAsOf: options.sourceAsOf ?? null,
        fetchedAt: options.fetchedAt ?? null,
        error,
        complete: coverage === "SUPPORTED" && !failureKind,
        failureKind,
        providerDiagnostics,
      };
    },
  };
}
