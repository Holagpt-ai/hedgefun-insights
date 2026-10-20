import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";
import type { RadarHistoricalContextLoadStatus } from "@/lib/radar/radar-historical-context-types";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import { mapRadarEnrichmentRequest } from "@/lib/radar/map-radar-row-to-repeat-mover-input";

function normalizeFingerprintTier(tier: string | null | undefined): string {
  if (tier === "NOTABLE" || tier === "SIGNIFICANT" || tier === "EXTREME") return tier;
  return "none";
}

/** Material inputs for repeat-mover context. Excludes live polling and securityId (validated separately). */
export function radarHistoricalQueryFingerprint(
  request: Pick<
    RadarHistoricalContextEnrichmentRequest,
    "symbol" | "sessionDate" | "tier"
  >,
): string {
  const symbol = request.symbol.trim().toUpperCase();
  const sessionDate = request.sessionDate?.trim() || "none";
  const tier = normalizeFingerprintTier(request.tier);
  return `${symbol}|${sessionDate}|${tier}`;
}

/** Canonical cache fingerprint for a Radar row (normalized tier, not raw signal_tier). */
export function radarHistoricalCacheFingerprintForRow(row: RadarV2ScreenerRow): string {
  return radarHistoricalQueryFingerprint(mapRadarEnrichmentRequest(row));
}

/** Canonical cache fingerprint for an enrichment request payload. */
export function radarHistoricalCacheFingerprintForRequest(
  request: RadarHistoricalContextEnrichmentRequest,
): string {
  return radarHistoricalQueryFingerprint({
    symbol: request.symbol,
    sessionDate: request.sessionDate ?? null,
    tier: normalizeFingerprintTier(request.tier),
  });
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

function lookupCacheEntry(
  symbol: string,
  fingerprint: string,
  sessionScope: string,
): RadarHistoricalCacheEntry | null {
  const entry = cacheBySymbol.get(symbol.trim().toUpperCase());
  if (!entry) return null;
  if (entry.sessionScope !== sessionScope) return null;
  if (entry.fingerprint !== fingerprint) return null;
  return entry;
}

export function readRadarHistoricalCache(
  symbol: string,
  fingerprint: string,
  sessionScope: string,
  nowMs: number,
  ttlMs = RADAR_HISTORICAL_CACHE_TTL_MS,
): RadarHistoricalCacheEntry | null {
  const entry = lookupCacheEntry(symbol, fingerprint, sessionScope);
  if (!entry) return null;
  if (nowMs - entry.fetchedAtMs > ttlMs) return null;
  if (entry.loadStatus === "loading" || entry.loadStatus === "pending") {
    return null;
  }
  touchEntry(symbol.trim().toUpperCase(), entry);
  return entry;
}

export function clearRadarHistoricalCacheSymbol(symbol: string, sessionScope?: string): void {
  const normalized = symbol.trim().toUpperCase();
  const entry = cacheBySymbol.get(normalized);
  if (!entry) return;
  if (sessionScope && entry.sessionScope !== sessionScope) return;
  cacheBySymbol.delete(normalized);
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
    const fingerprint = radarHistoricalCacheFingerprintForRow(row);
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
