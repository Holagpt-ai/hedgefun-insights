import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";
import type { RadarHistoricalContextLoadStatus } from "@/lib/radar/radar-historical-context-types";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import type { RepeatMoverContext } from "@/types/repeat-mover";

/** Material inputs for repeat-mover context. Excludes live price/volume polling fields. */
export function radarHistoricalQueryFingerprint(
  request: Pick<
    RadarHistoricalContextEnrichmentRequest,
    "symbol" | "securityId" | "sessionDate" | "tier"
  >,
): string {
  const symbol = request.symbol.trim().toUpperCase();
  const securityId = request.securityId?.trim() || "none";
  const sessionDate = request.sessionDate?.trim() || "none";
  const tier = request.tier?.trim() || "none";
  return `${symbol}|${securityId}|${sessionDate}|${tier}`;
}

/** Session boundary for cache reuse (not tied to synced_at polling). */
export function radarHistoricalSessionScopeKey(input: {
  sessionKind: string | null | undefined;
  tradingDate: string | null | undefined;
}): string {
  return `${input.sessionKind ?? "unknown"}|${input.tradingDate ?? "unknown"}`;
}

export type RadarHistoricalCacheEntry = {
  fingerprint: string;
  securityId: string | null;
  historicalContext: RepeatMoverContext | null;
  loadStatus: RadarHistoricalContextLoadStatus;
  fetchedAtMs: number;
  sessionScope: string;
};

export const RADAR_HISTORICAL_CACHE_MAX_ENTRIES = 300;
export const RADAR_HISTORICAL_CACHE_TTL_MS = 5 * 60_000;

const cacheBySymbol = new Map<string, RadarHistoricalCacheEntry>();

export function resetRadarHistoricalContextCacheForTests(): void {
  cacheBySymbol.clear();
}

function touchEntry(symbol: string, entry: RadarHistoricalCacheEntry): void {
  cacheBySymbol.delete(symbol);
  cacheBySymbol.set(symbol, entry);
}

function pruneCache(maxEntries: number): void {
  while (cacheBySymbol.size > maxEntries) {
    const oldest = cacheBySymbol.keys().next().value;
    if (!oldest) break;
    cacheBySymbol.delete(oldest);
  }
}

export function readRadarHistoricalCache(
  symbol: string,
  fingerprint: string,
  sessionScope: string,
  nowMs: number,
  ttlMs = RADAR_HISTORICAL_CACHE_TTL_MS,
): RadarHistoricalCacheEntry | null {
  const entry = cacheBySymbol.get(symbol.trim().toUpperCase());
  if (!entry) return null;
  if (entry.sessionScope !== sessionScope) return null;
  if (entry.fingerprint !== fingerprint) return null;
  if (nowMs - entry.fetchedAtMs > ttlMs) return null;
  if (entry.loadStatus === "loading" || entry.loadStatus === "pending") {
    return null;
  }
  touchEntry(symbol.trim().toUpperCase(), entry);
  return entry;
}

export function writeRadarHistoricalCache(entry: {
  symbol: string;
  fingerprint: string;
  securityId: string | null;
  historicalContext: RepeatMoverContext | null;
  loadStatus: RadarHistoricalContextLoadStatus;
  fetchedAtMs: number;
  sessionScope: string;
}): void {
  const symbol = entry.symbol.trim().toUpperCase();
  touchEntry(symbol, {
    fingerprint: entry.fingerprint,
    securityId: entry.securityId,
    historicalContext: entry.historicalContext,
    loadStatus: entry.loadStatus,
    fetchedAtMs: entry.fetchedAtMs,
    sessionScope: entry.sessionScope,
  });
  pruneCache(RADAR_HISTORICAL_CACHE_MAX_ENTRIES);
}

export function clearRadarHistoricalCacheForSessionScope(sessionScope: string): void {
  for (const [symbol, entry] of cacheBySymbol) {
    if (entry.sessionScope === sessionScope) cacheBySymbol.delete(symbol);
  }
}

export function applyRadarHistoricalCacheToRows(input: {
  rows: readonly RadarV2ScreenerRow[];
  sessionScope: string;
  nowMs: number;
  ttlMs?: number;
}): RadarV2ScreenerRow[] {
  const ttlMs = input.ttlMs ?? RADAR_HISTORICAL_CACHE_TTL_MS;
  return input.rows.map((row) => {
    const request = {
      symbol: row.symbol,
      securityId: row.securityId ?? null,
      sessionDate: row.radar_trading_date ?? null,
      tier: row.signal_tier ?? null,
    };
    const fingerprint = radarHistoricalQueryFingerprint(request);
    const cached = readRadarHistoricalCache(row.symbol, fingerprint, input.sessionScope, input.nowMs, ttlMs);
    if (!cached) {
      return {
        ...row,
        historicalContextLoadStatus: row.historicalContextLoadStatus ?? "pending",
      };
    }
    if (cached.securityId && row.securityId && cached.securityId !== row.securityId) {
      return {
        ...row,
        historicalContextLoadStatus: "pending",
      };
    }
    return {
      ...row,
      securityId: cached.securityId ?? row.securityId ?? null,
      historicalContext: cached.historicalContext,
      historicalContextLoadStatus: cached.loadStatus,
    };
  });
}

/** Copy only historical fields onto the latest published market row. */
export function mergeHistoricalFieldsOntoLatestRows(
  latestRows: readonly RadarV2ScreenerRow[],
  historicalRows: readonly RadarV2ScreenerRow[],
): RadarV2ScreenerRow[] {
  const bySymbol = new Map(historicalRows.map((row) => [row.symbol.toUpperCase(), row]));
  return latestRows.map((row) => {
    const historical = bySymbol.get(row.symbol.toUpperCase());
    if (!historical) return row;
    return {
      ...row,
      securityId: historical.securityId ?? row.securityId ?? null,
      historicalContext: historical.historicalContext ?? row.historicalContext ?? null,
      historicalContextLoadStatus: historical.historicalContextLoadStatus ?? row.historicalContextLoadStatus,
    };
  });
}
