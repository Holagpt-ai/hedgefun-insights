import { getRadarNews } from "@/lib/polygon";
import { createConcurrencyGate, mapPool } from "./concurrency";
import { uniqueNormalizedSymbols } from "./symbols";

export const RECENT_NEWS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RECENT_NEWS_STALE_TIME_MS = 15 * 60 * 1000;
export const RECENT_NEWS_FETCH_CONCURRENCY = 3;
export const RADAR_NEWS_UNAVAILABLE_MESSAGE = "Radar news temporarily unavailable";

export type RadarNewsProvider = "finnhub" | "massive";
export type RadarNewsStatus = "ok" | "empty" | "unavailable";

export interface RecentProviderHeadline {
  ticker: string;
  title: string;
  publishedAt: string;
  url: string | null;
  source: string;
  provider: RadarNewsProvider;
}

export interface RadarNewsRecord {
  ticker: string;
  status: RadarNewsStatus;
  article: RecentProviderHeadline | null;
}

const newsGate = createConcurrencyGate(RECENT_NEWS_FETCH_CONCURRENCY);
const newsMemory = new Map<string, { record: RadarNewsRecord; ts: number }>();
const newsInflight = new Map<string, Promise<RadarNewsRecord>>();

export function resetRecentNewsSymbolCache() {
  newsMemory.clear();
  newsInflight.clear();
}

export function peekRecentNewsRecord(symbol: string): RadarNewsRecord | null {
  const ticker = uniqueNormalizedSymbols([symbol])[0];
  if (!ticker) return null;
  return readCachedNews(ticker);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function publishedIso(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
  }
  return null;
}

function asProvider(value: unknown): RadarNewsProvider | null {
  return value === "finnhub" || value === "massive" ? value : null;
}

function emptyRecord(ticker: string, status: RadarNewsStatus): RadarNewsRecord {
  return { ticker, status, article: null };
}

export function mapRadarNewsPayload(
  ticker: string,
  payload: unknown,
  nowMs: number = Date.now(),
  windowMs: number = RECENT_NEWS_WINDOW_MS,
): RadarNewsRecord {
  if (!payload || typeof payload !== "object") return emptyRecord(ticker, "unavailable");
  const root = payload as Record<string, unknown>;
  const status: RadarNewsStatus =
    root.status === "ok" || root.status === "empty" || root.status === "unavailable"
      ? root.status
      : "unavailable";
  if (status !== "ok") return emptyRecord(ticker, status);

  const rows = Array.isArray(root.articles) ? root.articles : [];
  const cutoff = nowMs - windowMs;
  let best: RecentProviderHeadline | null = null;
  let bestMs = -1;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isNonEmptyString(row.title)) continue;
    const publishedAt = publishedIso(row.published_at);
    if (!publishedAt) continue;
    const publishedMs = Date.parse(publishedAt);
    if (publishedMs < cutoff || publishedMs > nowMs + 5 * 60 * 1000) continue;
    const provider = asProvider(row.provider);
    if (!provider) continue;
    if (publishedMs > bestMs) {
      bestMs = publishedMs;
      best = {
        ticker,
        title: row.title.trim(),
        publishedAt,
        url: isNonEmptyString(row.url) ? row.url.trim() : null,
        source: isNonEmptyString(row.source) ? row.source.trim() : provider === "finnhub" ? "Finnhub" : "Massive",
        provider,
      };
    }
  }
  if (!best) return emptyRecord(ticker, "empty");
  return { ticker, status: "ok", article: best };
}

function readCachedNews(ticker: string, nowMs: number = Date.now()): RadarNewsRecord | null {
  const hit = newsMemory.get(ticker);
  if (!hit) return null;
  if (nowMs - hit.ts > RECENT_NEWS_STALE_TIME_MS) {
    newsMemory.delete(ticker);
    return null;
  }
  return hit.record;
}

function throwTransientNews(): never {
  throw new Error(RADAR_NEWS_UNAVAILABLE_MESSAGE);
}

export async function getRecentHeadlineForSymbol(
  symbol: string,
  nowMs: number = Date.now(),
): Promise<RadarNewsRecord> {
  const ticker = uniqueNormalizedSymbols([symbol])[0];
  if (!ticker) return emptyRecord("", "empty");

  const cached = readCachedNews(ticker, nowMs);
  if (cached) return cached;

  const pending = newsInflight.get(ticker);
  if (pending) return pending;

  const request = (async () => {
    try {
      const payload = await newsGate.run(() => getRadarNews(ticker));
      const mapped = mapRadarNewsPayload(ticker, payload, nowMs);
      if (mapped.status === "unavailable") throwTransientNews();
      newsMemory.set(ticker, { record: mapped, ts: Date.now() });
      return mapped;
    } catch (error) {
      if (error instanceof Error && error.message === RADAR_NEWS_UNAVAILABLE_MESSAGE) throw error;
      throwTransientNews();
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
): Promise<Map<string, RadarNewsRecord>> {
  const unique = uniqueNormalizedSymbols(symbols);
  const rows = await mapPool(unique, RECENT_NEWS_FETCH_CONCURRENCY, async (symbol) => {
    try {
      return await getRecentHeadlineForSymbol(symbol, nowMs);
    } catch {
      return emptyRecord(symbol, "unavailable");
    }
  });
  const out = new Map<string, RadarNewsRecord>();
  for (const row of rows) {
    if (row.ticker) out.set(row.ticker, row);
  }
  return out;
}

export function radarNewsMapHasUnavailable(
  records: Map<string, RadarNewsRecord>,
  symbols: readonly string[],
): boolean {
  return uniqueNormalizedSymbols(symbols).some((symbol) => records.get(symbol)?.status === "unavailable");
}
