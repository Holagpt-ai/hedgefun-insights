// Client-side helpers to call market-data edge function
const MARKET_DATA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data`;

async function fetchMarketData(params: Record<string, string>) {
  const url = new URL(MARKET_DATA_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Market data unavailable");
  }

  return res.json();
}

export async function getTopGainers() {
  return fetchMarketData({ type: "gainers" });
}

export async function getTopLosers() {
  return fetchMarketData({ type: "losers" });
}

export async function getTickerSnapshot(ticker: string) {
  return fetchMarketData({ type: "snapshot", ticker });
}

export async function getTickerDetails(ticker: string) {
  return fetchMarketData({ type: "details", ticker });
}

export async function getTickerNews(ticker: string, limit = 10) {
  return fetchMarketData({ type: "news", ticker, limit: String(limit) });
}

export async function getAggregates(
  ticker: string,
  multiplier: number,
  timespan: string,
  from: string,
  to: string
) {
  return fetchMarketData({
    type: "aggregates",
    ticker,
    multiplier: String(multiplier),
    timespan,
    from,
    to,
  });
}

export async function getPrevClose(ticker: string) {
  return fetchMarketData({ type: "prev-close", ticker });
}

export async function getDividends(ticker: string, limit = 20) {
  return fetchMarketData({ type: "dividends", ticker, limit: String(limit) });
}

export async function getSplits(ticker: string, limit = 20) {
  return fetchMarketData({ type: "splits", ticker, limit: String(limit) });
}
