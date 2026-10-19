import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
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

export function hasVerifiedStocksistCatalyst(
  symbol: string,
  catalystBySymbol: ReadonlyMap<string, MarketPulseVerifiedCatalyst>,
): boolean {
  return catalystBySymbol.has(symbol.trim().toUpperCase());
}
