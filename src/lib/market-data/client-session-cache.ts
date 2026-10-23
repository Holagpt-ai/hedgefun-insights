/** Browser session cache for market-data Edge responses (quotes and bars). */

export type MarketDataFreshness = "fresh" | "aging" | "closed";

export type MarketDataClientMeta = {
  freshness: MarketDataFreshness;
  cache: string;
  sourceAsOfMs: number | null;
  cacheAgeMs: number;
  maxAgeSeconds: number;
};

export type CachedMarketDataEntry<T> = {
  body: T;
  meta: MarketDataClientMeta;
  storedAtMs: number;
};

const store = new Map<string, CachedMarketDataEntry<unknown>>();

function parseFreshness(value: string | null): MarketDataFreshness {
  if (value === "aging" || value === "closed") return value;
  return "fresh";
}

function parseMaxAge(cacheControl: string | null, fallbackSeconds: number): number {
  if (!cacheControl) return fallbackSeconds;
  const match = /max-age=(\d+)/i.exec(cacheControl);
  if (!match) return fallbackSeconds;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackSeconds;
}

export function readMarketDataResponseMeta(
  response: Response,
  fallbackMaxAgeSeconds: number,
): MarketDataClientMeta {
  const freshness = parseFreshness(response.headers.get("X-Market-Data-Freshness"));
  const cache = response.headers.get("X-Market-Data-Cache") ?? "unknown";
  const cacheAgeHeader = response.headers.get("X-Market-Data-Cache-Age-Ms");
  const cacheAgeMs = cacheAgeHeader != null && Number.isFinite(Number(cacheAgeHeader))
    ? Math.max(0, Number(cacheAgeHeader))
    : 0;
  const sourceHeader = response.headers.get("X-Market-Data-Source-As-Of");
  const sourceAsOfMs = sourceHeader ? Date.parse(sourceHeader) : null;
  const maxAgeSeconds = parseMaxAge(response.headers.get("Cache-Control"), fallbackMaxAgeSeconds);
  return {
    freshness,
    cache,
    sourceAsOfMs: sourceAsOfMs != null && Number.isFinite(sourceAsOfMs) ? sourceAsOfMs : null,
    cacheAgeMs,
    maxAgeSeconds,
  };
}

export function marketDataClientCacheKey(url: string): string {
  return url;
}

export function readMarketDataClientCache<T>(key: string, nowMs = Date.now()): CachedMarketDataEntry<T> | null {
  const row = store.get(key);
  if (!row) return null;
  const ageMs = Math.max(0, nowMs - row.storedAtMs);
  const budgetMs = row.meta.maxAgeSeconds * 1000;
  if (ageMs > budgetMs) {
    store.delete(key);
    return null;
  }
  return row as CachedMarketDataEntry<T>;
}

export function writeMarketDataClientCache<T>(
  key: string,
  body: T,
  meta: MarketDataClientMeta,
  nowMs = Date.now(),
): void {
  store.set(key, { body, meta, storedAtMs: nowMs });
  while (store.size > 200) {
    const oldest = store.keys().next().value;
    if (oldest == null) break;
    store.delete(oldest);
  }
}

export function resetMarketDataClientCacheForTests(): void {
  store.clear();
}
