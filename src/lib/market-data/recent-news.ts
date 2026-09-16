import { getTickerNews } from "@/lib/polygon";
import { createConcurrencyGate, mapPool } from "./concurrency";
import { uniqueNormalizedSymbols } from "./symbols";

export const RECENT_NEWS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RECENT_NEWS_STALE_TIME_MS = 15 * 60 * 1000;
export const RECENT_NEWS_FETCH_CONCURRENCY = 3;

export interface RecentProviderHeadline {
  ticker: string;
  title: string;
  publishedAt: string | null;
  url: string | null;
}

const newsGate = createConcurrencyGate(RECENT_NEWS_FETCH_CONCURRENCY);
const newsMemory = new Map<string, { headline: RecentProviderHeadline | null; ts: number }>();
const newsInflight = new Map<string, Promise<RecentProviderHeadline | null>>();

export function resetRecentNewsSymbolCache() {
  newsMemory.clear();
  newsInflight.clear();
}

function pickTitle(row: Record<string, unknown>): string | null {
  for (const key of ["title", "headline", "description"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickPublished(row: Record<string, unknown>): string | null {
  for (const key of ["published_utc", "published_at", "publishedAt"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickUrl(row: Record<string, unknown>): string | null {
  if (typeof row.article_url === "string" && row.article_url.trim()) return row.article_url.trim();
  if (typeof row.url === "string" && row.url.trim()) return row.url.trim();
  return null;
}

export function mapRecentNewsPayload(
  ticker: string,
  payload: unknown,
  nowMs: number = Date.now(),
  windowMs: number = RECENT_NEWS_WINDOW_MS,
): RecentProviderHeadline | null {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
      ? (payload as { results: unknown[] }).results
      : [];
  const cutoff = nowMs - windowMs;
  let best: RecentProviderHeadline | null = null;
  let bestMs = -1;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = pickTitle(row);
    if (!title) continue;
    const publishedAt = pickPublished(row);
    const publishedMs = publishedAt ? Date.parse(publishedAt) : Number.NaN;
    if (!Number.isFinite(publishedMs) || publishedMs < cutoff) continue;
    if (publishedMs > bestMs) {
      bestMs = publishedMs;
      best = { ticker, title, publishedAt, url: pickUrl(row) };
    }
  }
  return best;
}

function readCachedHeadline(ticker: string, nowMs: number = Date.now()): RecentProviderHeadline | null | undefined {
  const hit = newsMemory.get(ticker);
  if (!hit) return undefined;
  if (nowMs - hit.ts > RECENT_NEWS_STALE_TIME_MS) {
    newsMemory.delete(ticker);
    return undefined;
  }
  return hit.headline;
}

export async function getRecentHeadlineForSymbol(
  symbol: string,
  nowMs: number = Date.now(),
): Promise<RecentProviderHeadline | null> {
  const ticker = uniqueNormalizedSymbols([symbol])[0];
  if (!ticker) return null;

  const cached = readCachedHeadline(ticker, nowMs);
  if (cached !== undefined) return cached;

  const pending = newsInflight.get(ticker);
  if (pending) return pending;

  const request = (async () => {
    try {
      const payload = await newsGate.run(() => getTickerNews(ticker, 5));
      const headline = mapRecentNewsPayload(ticker, payload, nowMs);
      newsMemory.set(ticker, { headline, ts: Date.now() });
      return headline;
    } catch {
      return null;
    } finally {
      newsInflight.delete(ticker);
    }
  })();

  newsInflight.set(ticker, request);
  return request;
}

export async function getRecentHeadlinesForSymbols(
  symbols: readonly string[],
  nowMs: number = Date.now(),
): Promise<Map<string, RecentProviderHeadline>> {
  const unique = uniqueNormalizedSymbols(symbols);
  const rows = await mapPool(unique, RECENT_NEWS_FETCH_CONCURRENCY, (symbol) =>
    getRecentHeadlineForSymbol(symbol, nowMs),
  );
  const out = new Map<string, RecentProviderHeadline>();
  for (const row of rows) {
    if (row?.ticker) out.set(row.ticker, row);
  }
  return out;
}
