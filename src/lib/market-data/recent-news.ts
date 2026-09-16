import { normalizeSymbol } from "@/lib/catalyst/parsers";
import { getTickerNews } from "@/lib/polygon";
import { mapPool } from "./concurrency";

export const RECENT_NEWS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RECENT_NEWS_FETCH_CONCURRENCY = 3;

export interface RecentProviderHeadline {
  ticker: string;
  title: string;
  publishedAt: string | null;
  url: string | null;
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

export async function getRecentHeadlineForSymbol(
  symbol: string,
  nowMs: number = Date.now(),
): Promise<RecentProviderHeadline | null> {
  const ticker = normalizeSymbol(symbol);
  if (!ticker) return null;
  try {
    const payload = await getTickerNews(ticker, 5);
    return mapRecentNewsPayload(ticker, payload, nowMs);
  } catch {
    return null;
  }
}

export async function getRecentHeadlinesForSymbols(
  symbols: readonly string[],
  nowMs: number = Date.now(),
): Promise<Map<string, RecentProviderHeadline>> {
  const unique = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean) as string[])];
  const rows = await mapPool(unique, RECENT_NEWS_FETCH_CONCURRENCY, (symbol) =>
    getRecentHeadlineForSymbol(symbol, nowMs),
  );
  const out = new Map<string, RecentProviderHeadline>();
  for (const row of rows) {
    if (row?.ticker) out.set(row.ticker, row);
  }
  return out;
}
