import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { buildSymbolCatalystPlatformMap } from "@/lib/catalyst/build-symbol-catalyst-platform-map";
import {
  buildSymbolCatalystPlatformContext,
  resolveSymbolCatalystAvailability,
  type SymbolCatalystPlatformContext,
} from "@/lib/catalyst/catalyst-platform-context";
import type { CatalystAvailability } from "@/lib/catalyst/intelligence-v2";
import { resolveVerifiedCatalystForPulse } from "@/lib/markets/market-pulse-catalyst";
import type {
  MarketPulseSessionEvidence,
  MarketPulseVerifiedCatalyst,
} from "@/lib/markets/market-pulse-contract";
import type { V2Row } from "@/hooks/useWatchlistV2";

function sessionEvidenceFromRow(row: V2Row): MarketPulseSessionEvidence {
  if (row.analysisPresentation === "last_completed") return "prior_session_historical";
  if (row.analysisPresentation === "live") return "delayed_snapshot";
  return "unverified";
}

/**
 * Provider quote observation time from Watchlist analysis contract (`snapshot_ts_ms` only).
 * Does not treat analysis expiry, validThrough, or clock now as price observations.
 */
export function watchlistPriceObservationMs(row: V2Row): number | null {
  const snap = row.inputsQuality.snapshot_ts_ms;
  if (typeof snap === "number" && Number.isFinite(snap) && snap > 0) return snap;
  return null;
}

export function resolveWatchlistVerifiedCatalyst(
  row: V2Row,
  entry: CatalystEnrichmentEntry | undefined,
  nowMs: number = Date.now(),
): MarketPulseVerifiedCatalyst | null {
  return resolveVerifiedCatalystForPulse({
    symbol: row.ticker,
    entry,
    observationMs: watchlistPriceObservationMs(row),
    sessionEvidence: sessionEvidenceFromRow(row),
    nowMs,
    requirePriceObservationMs: true,
  });
}

export function buildWatchlistCatalystMap(
  rows: readonly V2Row[],
  enrichment: Map<string, CatalystEnrichmentEntry> | undefined,
  nowMs: number = Date.now(),
): Map<string, MarketPulseVerifiedCatalyst> {
  const out = new Map<string, MarketPulseVerifiedCatalyst>();
  for (const row of rows) {
    const sym = row.ticker.toUpperCase();
    const entry = enrichment?.get(sym);
    const verified = resolveWatchlistVerifiedCatalyst(row, entry, nowMs);
    if (verified) out.set(sym, verified);
  }
  return out;
}

export function resolveWatchlistPlatformContext(
  row: V2Row,
  entry: CatalystEnrichmentEntry | undefined,
  opts: { queryError?: boolean; nowMs?: number } = {},
): SymbolCatalystPlatformContext {
  const nowMs = opts.nowMs ?? Date.now();
  const symbol = row.ticker.trim().toUpperCase();
  const availability = resolveSymbolCatalystAvailability({
    queryError: opts.queryError === true,
    entry,
    nowMs,
  });
  return buildSymbolCatalystPlatformContext({ symbol, entry, availability, nowMs });
}

export function watchlistCatalystAvailabilityLabel(
  availability: CatalystAvailability | "pending",
): string {
  if (availability === "verified") return "Verified catalyst";
  if (availability === "unavailable") return "Catalyst intel unavailable";
  if (availability === "pending") return "Checking catalyst intel…";
  return "No verified catalyst";
}

export function hasVerifiedStocksistCatalyst(
  symbol: string,
  catalystBySymbol: ReadonlyMap<string, MarketPulseVerifiedCatalyst>,
): boolean {
  return catalystBySymbol.has(symbol.trim().toUpperCase());
}

export type WatchlistCatalystIntelStatus = "verified" | "none" | "unavailable" | "pending";

/** Aligns Watchlist catalyst UX with Radar / AM Inbox platform availability contracts. */
export function resolveWatchlistCatalystIntelStatus(input: {
  platform?: SymbolCatalystPlatformContext | null;
  catalystIntelPending?: boolean;
  catalystIntelError?: boolean;
}): WatchlistCatalystIntelStatus {
  if (input.catalystIntelError) return "unavailable";
  const availability = input.platform?.availability;
  if (availability === "verified") return "verified";
  if (availability === "unavailable") return "unavailable";
  if (input.catalystIntelPending) return "pending";
  if (availability === "none") return "none";
  return "none";
}

export function buildWatchlistPlatformContextMap(input: {
  symbols: readonly string[];
  enrichment?: Map<string, CatalystEnrichmentEntry> | undefined;
  queryError?: boolean;
  queryPending?: boolean;
  nowMs?: number;
}): Map<string, SymbolCatalystPlatformContext> {
  return buildSymbolCatalystPlatformMap({
    symbols: input.symbols,
    enrichment: input.enrichment,
    queryError: input.queryError,
    queryPending: input.queryPending,
    nowMs: input.nowMs,
  });
}
