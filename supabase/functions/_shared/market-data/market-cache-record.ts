/**
 * Provider-neutral snapshot and aggregate cache records.
 * The HTTP body stays the existing payload. Freshness is a label beside it.
 */

export const FRESH_MAX_AGE_MS = 30_000;
/** Active quote tape. Not served past this age, and never labeled aging. */
export const SNAPSHOT_SERVE_MS = 30_000;
/** Live charts. Fresh for 30s, then aging until this boundary. */
export const LIVE_AGGREGATE_SERVE_MS = 60_000;
export const CLOSED_AGGREGATE_SERVE_MS = 6 * 60 * 60 * 1000;
export const EMPTY_SERVE_MS = 30_000;
export const SHARED_CACHE_MAX_BYTES = 96 * 1024;
export const MEMORY_CACHE_MAX_BYTES = 256 * 1024;

export type MarketCacheFreshness = "fresh" | "aging" | "closed";

export type MarketCacheSurface = "quote" | "bars";

export type MarketCacheEnvelope = {
  v: 1;
  payload: unknown;
  sourceAsOfMs: number | null;
  cachedAtMs: number;
  closed: boolean;
  empty: boolean;
  surface: MarketCacheSurface;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MULTIPLIER_RE = /^[1-9]\d{0,2}$/;
const TIMESPANS = new Set(["minute", "hour", "day", "week", "month"]);

export function snapshotCacheKey(ticker: string): string {
  return `mkt:v1:snap:${ticker}`;
}

export function aggregateCacheKey(parts: {
  ticker: string;
  multiplier: string;
  timespan: string;
  from: string;
  to: string;
}): string | null {
  if (!MULTIPLIER_RE.test(parts.multiplier)) return null;
  if (!TIMESPANS.has(parts.timespan)) return null;
  if (!DATE_RE.test(parts.from) || !DATE_RE.test(parts.to)) return null;
  if (parts.from > parts.to) return null;
  return `mkt:v1:agg:${parts.ticker}:${parts.multiplier}:${parts.timespan}:${parts.from}:${parts.to}`;
}

export function etCalendarDate(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

/** A range that ends before today's ET session will not gain new bars. */
export function isClosedAggregateWindow(to: string, nowMs: number): boolean {
  return DATE_RE.test(to) && to < etCalendarDate(nowMs);
}

export function envelopeServeMs(envelope: { closed: boolean; empty: boolean; surface?: MarketCacheSurface }): number {
  if (envelope.empty) return EMPTY_SERVE_MS;
  if (envelope.closed) return CLOSED_AGGREGATE_SERVE_MS;
  if (envelope.surface === "bars") return LIVE_AGGREGATE_SERVE_MS;
  return SNAPSHOT_SERVE_MS;
}

export function freshnessLabel(envelope: MarketCacheEnvelope, nowMs: number): MarketCacheFreshness {
  if (envelope.closed && !envelope.empty) return "closed";
  const ageMs = Math.max(0, nowMs - envelope.cachedAtMs);
  if (envelope.surface === "quote") return "fresh";
  if (ageMs <= FRESH_MAX_AGE_MS) return "fresh";
  return "aging";
}

/** Remaining seconds a shared HTTP cache may store this response. */
export function cacheControlMaxAgeSeconds(envelope: MarketCacheEnvelope, nowMs: number): number {
  const remainMs = envelopeServeMs(envelope) - Math.max(0, nowMs - envelope.cachedAtMs);
  if (remainMs <= 0) return 0;
  return Math.floor(remainMs / 1000);
}

export function recordIsServable(envelope: MarketCacheEnvelope, nowMs: number): boolean {
  if (envelope.cachedAtMs > nowMs + 5_000) return false;
  return nowMs - envelope.cachedAtMs <= envelopeServeMs(envelope);
}

export function encodeEnvelope(envelope: MarketCacheEnvelope): string {
  return JSON.stringify(envelope);
}

export function decodeEnvelope(raw: string): MarketCacheEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MarketCacheEnvelope>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.cachedAtMs !== "number" || !Number.isFinite(parsed.cachedAtMs)) return null;
    if (typeof parsed.closed !== "boolean" || typeof parsed.empty !== "boolean") return null;
    if (!("payload" in parsed)) return null;
    const sourceAsOfMs = parsed.sourceAsOfMs;
    if (sourceAsOfMs != null && (typeof sourceAsOfMs !== "number" || !Number.isFinite(sourceAsOfMs))) return null;
    const surface: MarketCacheSurface = parsed.surface === "bars" ? "bars" : "quote";
    return {
      v: 1,
      payload: parsed.payload,
      sourceAsOfMs: sourceAsOfMs ?? null,
      cachedAtMs: parsed.cachedAtMs,
      closed: parsed.closed,
      empty: parsed.empty,
      surface,
    };
  } catch {
    return null;
  }
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export type CachePayloadFacts = {
  cacheable: boolean;
  empty: boolean;
  sourceAsOfMs: number | null;
};

export function describeSnapshotPayload(payload: unknown): CachePayloadFacts {
  const empty = payload == null;
  const cacheable = empty || (typeof payload === "object" && !Array.isArray(payload));
  return {
    cacheable,
    empty,
    sourceAsOfMs: cacheable && !empty ? snapshotSourceAsOfMs(payload) : null,
  };
}

export function describeAggregatePayload(payload: unknown): CachePayloadFacts {
  if (!Array.isArray(payload)) return { cacheable: false, empty: false, sourceAsOfMs: null };
  return {
    cacheable: true,
    empty: payload.length === 0,
    sourceAsOfMs: aggregateSourceAsOfMs(payload),
  };
}

/** Polygon snapshot `updated` is nanoseconds. Trade and minute stamps vary. */
export function snapshotSourceAsOfMs(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const updated = coerceEpochMs(row.updated);
  if (updated != null) return updated;
  const lastTrade = row.lastTrade;
  if (lastTrade && typeof lastTrade === "object") {
    const trade = coerceEpochMs((lastTrade as Record<string, unknown>).t);
    if (trade != null) return trade;
  }
  const min = row.min;
  if (min && typeof min === "object") return coerceEpochMs((min as Record<string, unknown>).t);
  return null;
}

export function aggregateSourceAsOfMs(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  let max: number | null = null;
  for (const bar of payload) {
    if (!bar || typeof bar !== "object") continue;
    const ts = coerceEpochMs((bar as Record<string, unknown>).t);
    if (ts == null) continue;
    if (max == null || ts > max) max = ts;
  }
  return max;
}

export function coerceEpochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value > 1e17) return Math.round(value / 1e6);
  if (value > 1e14) return Math.round(value / 1e3);
  if (value > 1e11) return Math.round(value);
  if (value > 1e9) return Math.round(value * 1000);
  return null;
}

export function marketDataCacheHeaders(meta: {
  freshness: MarketCacheFreshness;
  cache: "memory" | "shared" | "origin";
  sourceAsOfMs: number | null;
  cacheAgeMs: number;
  cacheControlMaxAgeSeconds: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Market-Data-Freshness": meta.freshness,
    "X-Market-Data-Cache": meta.cache,
    "X-Market-Data-Cache-Age-Ms": String(Math.max(0, meta.cacheAgeMs)),
    "Cache-Control": `public, max-age=${meta.cacheControlMaxAgeSeconds}`,
  };
  if (meta.sourceAsOfMs != null) {
    headers["X-Market-Data-Source-As-Of"] = new Date(meta.sourceAsOfMs).toISOString();
  }
  return headers;
}
