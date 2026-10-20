/** In-memory cache, inflight dedupe, and per-IP rate limit for public market-data. */

export const SNAPSHOT_CACHE_TTL_MS = 30_000;
export const AGGREGATES_CACHE_TTL_MS = 30_000;
export const PUBLIC_MARKET_DATA_WINDOW_MS = 60_000;
export const PUBLIC_MARKET_DATA_MAX_REQUESTS = 180;

type CacheEntry = { data: unknown; ts: number };
type RateBucket = { count: number; resetAt: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const rateBuckets = new Map<string, RateBucket>();

export function publicMarketDataClientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return "unknown";
}

/** Returns true when the request is allowed under the in-memory limiter. */
export function consumePublicMarketDataRateLimit(
  key: string,
  nowMs = Date.now(),
): boolean {
  const entry = rateBuckets.get(key);
  if (!entry || nowMs >= entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: nowMs + PUBLIC_MARKET_DATA_WINDOW_MS });
    return true;
  }
  if (entry.count >= PUBLIC_MARKET_DATA_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

export function getPublicMarketDataCached(
  key: string,
  ttlMs: number,
  nowMs = Date.now(),
): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (nowMs - entry.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setPublicMarketDataCached(
  key: string,
  data: unknown,
  nowMs = Date.now(),
): void {
  cache.set(key, { data, ts: nowMs });
}

export function dedupePublicMarketDataInflight<T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

/** Test helper — not used in production request handling. */
export function resetPublicMarketDataGuardForTests(): void {
  cache.clear();
  inflight.clear();
  rateBuckets.clear();
}
