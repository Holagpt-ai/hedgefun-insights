import { INTRADAY_RECONSTRUCTION_SOURCE } from "@/config/intraday-reconstruction.config";
import {
  normalizePolygonMinuteBars,
  type RawPolygonAggregateBar,
} from "@/lib/intraday-reconstruction/normalize-minute-bars";
import type { NormalizedIntradayBar } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";

export interface MinuteBarsFetchResult {
  bars: NormalizedIntradayBar[];
  source: string;
  sourceAsOf: string | null;
  fetchedAt: string;
  error: string | null;
  complete: boolean;
}

export async function fetchPolygonMinuteBarsForSession(input: {
  symbol: string;
  sessionDate: string;
  apiKey: string;
  multiplier?: 1 | 5;
  fetchFn?: typeof fetch;
}): Promise<MinuteBarsFetchResult> {
  const fetchedAt = new Date().toISOString();
  const multiplier = input.multiplier ?? 1;
  const url = new URL(
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(input.symbol)}/range/${multiplier}/minute/${input.sessionDate}/${input.sessionDate}`,
  );
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  url.searchParams.set("apiKey", input.apiKey);

  const fetchImpl = input.fetchFn ?? fetch;
  try {
    const res = await fetchImpl(url.toString());
    if (!res.ok) {
      return {
        bars: [],
        source: INTRADAY_RECONSTRUCTION_SOURCE,
        sourceAsOf: null,
        fetchedAt,
        error: `polygon_http_${res.status}`,
        complete: false,
      };
    }
    const json = await res.json() as { results?: RawPolygonAggregateBar[]; resultsCount?: number };
    const bars = normalizePolygonMinuteBars(json.results ?? [], input.sessionDate);
    return {
      bars,
      source: INTRADAY_RECONSTRUCTION_SOURCE,
      sourceAsOf: fetchedAt,
      fetchedAt,
      error: null,
      complete: bars.length > 0,
    };
  } catch (error) {
    return {
      bars: [],
      source: INTRADAY_RECONSTRUCTION_SOURCE,
      sourceAsOf: null,
      fetchedAt,
      error: String(error),
      complete: false,
    };
  }
}
