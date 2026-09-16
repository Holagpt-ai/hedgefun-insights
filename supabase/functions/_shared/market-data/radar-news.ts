export const RADAR_NEWS_LOOKBACK_HOURS = 24;
export const RADAR_NEWS_LIMIT = 5;
export const RADAR_NEWS_CACHE_TTL_MS = 10 * 60 * 1000;

export type RadarNewsProvider = "finnhub" | "massive";
export type RadarNewsStatus = "ok" | "empty" | "unavailable";

export type RadarNewsArticle = {
  title: string;
  source: string;
  published_at: string;
  url: string | null;
  provider: RadarNewsProvider;
};

export type RadarNewsResponse = {
  ticker: string;
  status: RadarNewsStatus;
  articles: RadarNewsArticle[];
};

export type ProviderNewsFetch =
  | { ok: true; payload: unknown }
  | { ok: false };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function finnhubDateWindow(
  nowMs: number,
  lookbackHours: number = RADAR_NEWS_LOOKBACK_HOURS,
): { from: string; to: string } {
  const lookbackMs = Math.max(1, lookbackHours) * 60 * 60 * 1000;
  const fromMs = nowMs - lookbackMs - 24 * 60 * 60 * 1000;
  return {
    from: new Date(fromMs).toISOString().slice(0, 10),
    to: new Date(nowMs).toISOString().slice(0, 10),
  };
}

export function publishedAtToIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms).toISOString();
  }
  return null;
}

function inLookback(iso: string, nowMs: number, lookbackMs: number): boolean {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms <= nowMs + 5 * 60 * 1000 && ms >= nowMs - lookbackMs;
}

function asUrl(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null;
  const url = value.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
}

function normalizeHeadline(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function articleKey(article: RadarNewsArticle): string {
  if (article.url) return `url:${normalizeUrl(article.url)}`;
  return `title:${normalizeHeadline(article.title)}`;
}

function pickTitle(row: Record<string, unknown>): string | null {
  for (const key of ["headline", "title"]) {
    if (isNonEmptyString(row[key])) return row[key].trim();
  }
  return null;
}

function asRows(payload: unknown): Record<string, unknown>[] {
  const raw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
      ? (payload as { results: unknown[] }).results
      : [];
  return raw.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

export function mapFinnhubCompanyNews(
  payload: unknown,
  nowMs: number,
  lookbackMs: number,
): RadarNewsArticle[] {
  const out: RadarNewsArticle[] = [];
  for (const row of asRows(payload)) {
    const title = pickTitle(row);
    const published_at = publishedAtToIso(row.datetime ?? row.published_at);
    if (!title || !published_at || !inLookback(published_at, nowMs, lookbackMs)) continue;
    out.push({
      title,
      source: isNonEmptyString(row.source) ? row.source.trim() : "Finnhub",
      published_at,
      url: asUrl(row.url),
      provider: "finnhub",
    });
  }
  return out;
}

export function mapMassiveTickerNews(
  payload: unknown,
  nowMs: number,
  lookbackMs: number,
): RadarNewsArticle[] {
  const out: RadarNewsArticle[] = [];
  for (const row of asRows(payload)) {
    const title = pickTitle(row);
    const published_at = publishedAtToIso(row.published_utc ?? row.published_at ?? row.publishedAt);
    if (!title || !published_at || !inLookback(published_at, nowMs, lookbackMs)) continue;
    const publisher = row.publisher && typeof row.publisher === "object"
      ? (row.publisher as Record<string, unknown>).name
      : null;
    out.push({
      title,
      source: isNonEmptyString(publisher)
        ? publisher.trim()
        : isNonEmptyString(row.source)
          ? row.source.trim()
          : "Massive",
      published_at,
      url: asUrl(row.article_url ?? row.url),
      provider: "massive",
    });
  }
  return out;
}

export function mergeRadarNewsArticles(articles: readonly RadarNewsArticle[]): RadarNewsArticle[] {
  const byKey = new Map<string, RadarNewsArticle>();
  for (const article of articles) {
    const key = articleKey(article);
    const existing = byKey.get(key);
    if (!existing || Date.parse(article.published_at) > Date.parse(existing.published_at)) {
      byKey.set(key, article);
    }
  }
  return [...byKey.values()].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

export function assembleRadarNewsResponse(
  ticker: string,
  finnhub: ProviderNewsFetch,
  massive: ProviderNewsFetch,
  nowMs: number,
  lookbackHours: number = RADAR_NEWS_LOOKBACK_HOURS,
  limit: number = RADAR_NEWS_LIMIT,
): RadarNewsResponse {
  const lookbackMs = Math.max(1, lookbackHours) * 60 * 60 * 1000;
  const capped = Math.max(1, Math.min(limit, 10));
  const collected: RadarNewsArticle[] = [];
  if (finnhub.ok) collected.push(...mapFinnhubCompanyNews(finnhub.payload, nowMs, lookbackMs));
  if (massive.ok) collected.push(...mapMassiveTickerNews(massive.payload, nowMs, lookbackMs));
  const articles = mergeRadarNewsArticles(collected).slice(0, capped);

  if (articles.length > 0) {
    return { ticker, status: "ok", articles };
  }
  if (!finnhub.ok && !massive.ok) {
    return { ticker, status: "unavailable", articles: [] };
  }
  return { ticker, status: "empty", articles: [] };
}

export function shouldCacheRadarNews(status: RadarNewsStatus): boolean {
  return status === "ok" || status === "empty";
}
