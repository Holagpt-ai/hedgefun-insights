// Client-side helpers to call market-data edge function
import {
  marketDataClientCacheKey,
  readMarketDataClientCache,
  readMarketDataResponseMeta,
  writeMarketDataClientCache,
  type MarketDataClientMeta,
} from "@/lib/market-data/client-session-cache";

const MARKET_DATA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data`;
type MarketDataFetchResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge JSON payloads vary by route
  body: any;
  meta: MarketDataClientMeta;
  fromClientCache: boolean;
};

const marketDataInflight = new Map<string, Promise<MarketDataFetchResult>>();

const QUOTE_FALLBACK_MAX_AGE_SECONDS = 30;
const BARS_FALLBACK_MAX_AGE_SECONDS = 60;

export type MarketDataFetchMeta = MarketDataClientMeta;

async function fetchMarketDataOnce(url: string, fallbackMaxAgeSeconds: number) {
  const cached = readMarketDataClientCache<unknown>(marketDataClientCacheKey(url));
  if (cached) {
    return { body: cached.body, meta: cached.meta, fromClientCache: true as const };
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });

  const meta = readMarketDataResponseMeta(res, fallbackMaxAgeSeconds);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Market data unavailable");
  }

  const body = await res.json();
  writeMarketDataClientCache(marketDataClientCacheKey(url), body, meta);
  return { body, meta, fromClientCache: false as const };
}

async function fetchMarketData(
  params: Record<string, string>,
  fallbackMaxAgeSeconds: number,
): Promise<MarketDataFetchResult> {
  const url = new URL(MARKET_DATA_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const key = url.toString();
  const existing = marketDataInflight.get(key);
  if (existing) return existing;
  const pending = fetchMarketDataOnce(key, fallbackMaxAgeSeconds).finally(() => {
    marketDataInflight.delete(key);
  });
  marketDataInflight.set(key, pending);
  return pending;
}

export async function getTopGainers() {
  const result = await fetchMarketData({ type: "gainers" }, 30);
  return result.body;
}

export async function getTopLosers() {
  const result = await fetchMarketData({ type: "losers" }, 30);
  return result.body;
}

export async function getTickerSnapshot(ticker: string) {
  const result = await fetchMarketData({ type: "snapshot", ticker }, QUOTE_FALLBACK_MAX_AGE_SECONDS);
  return result.body;
}

export async function getTickerDetails(ticker: string) {
  const result = await fetchMarketData({ type: "details", ticker }, 60);
  return result.body;
}

export async function getTickerNews(ticker: string, limit = 10) {
  const result = await fetchMarketData({ type: "news", ticker, limit: String(limit) }, 60);
  return result.body;
}

/** Radar-only multi-source news. Server uses Finnhub + Massive. No browser API key. */
export async function getRadarNews(ticker: string, lookbackHours = 24, limit = 5) {
  const result = await fetchMarketData({
    type: "radar-news",
    ticker,
    lookback_hours: String(lookbackHours),
    limit: String(limit),
  }, 60);
  return result.body;
}

/** Massive Float dataset via the existing market-data Edge Function. No browser API key. */
export async function getFloat(ticker: string) {
  const result = await fetchMarketData({ type: "float", ticker }, 120);
  return result.body;
}

export async function getAggregates(
  ticker: string,
  multiplier: number,
  timespan: string,
  from: string,
  to: string
) {
  const result = await fetchMarketData({
    type: "aggregates",
    ticker,
    multiplier: String(multiplier),
    timespan,
    from,
    to,
  }, BARS_FALLBACK_MAX_AGE_SECONDS);
  return result.body;
}

export async function getPrevClose(ticker: string) {
  const result = await fetchMarketData({ type: "prev-close", ticker }, 120);
  return result.body;
}

export async function getDividends(ticker: string, limit = 20) {
  const result = await fetchMarketData({ type: "dividends", ticker, limit: String(limit) }, 300);
  return result.body;
}

export async function getSplits(ticker: string, limit = 20) {
  const result = await fetchMarketData({ type: "splits", ticker, limit: String(limit) }, 300);
  return result.body;
}
