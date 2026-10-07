import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import {
  evaluateScreenerContinuation,
  type ScreenerContinuationSource,
} from "@/lib/screeners/screener-continuation";
import {
  radarRankedRowToStocksistSignal,
  type StocksistSignalSource,
} from "@/lib/execution/signal/map-radar-row-to-stocksist-signal";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";

function isCatalystMomentumRow(row: RadarRankedRow): boolean {
  const promo = row.promotion_reason != null ? String(row.promotion_reason) : "";
  if (/catalyst/i.test(promo)) return true;
  if (row.primary_scanner_event != null && /catalyst|fda|earnings|news/i.test(String(row.primary_scanner_event))) {
    return true;
  }
  const cont = row as ScreenerContinuationSource;
  return cont.continuation_catalyst_quality != null;
}

function freshnessForRow(row: RadarRankedRow): "FRESH" | "UNKNOWN" {
  const fc = row.freshness_class?.toLowerCase();
  if (fc === "stale" || fc === "cooling") return "UNKNOWN";
  if (fc === "fresh" || fc === "active") return "FRESH";
  // Live radar rows without explicit freshness still carry scorable intraday metrics.
  return row.provider_as_of || row.updated_at ? "FRESH" : "UNKNOWN";
}

function classifyRadarRow(row: RadarRankedRow): StocksistSignalSource {
  const continuation = evaluateScreenerContinuation(row as ScreenerContinuationSource, {
    freshnessState: freshnessForRow(row),
  });
  if (continuation.result.label === "READY" && !continuation.result.disqualified && continuation.result.categories.length > 0) {
    return "continuation";
  }
  if (isCatalystMomentumRow(row)) return "catalyst";
  return "radar";
}

/** Derive execution signals from authoritative Day Trade desk rows (Top-10 + universe slice). */
export function stocksistSignalsFromRadarRows(rows: readonly RadarRankedRow[]): StocksistSignal[] {
  const out: StocksistSignal[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const source = classifyRadarRow(row);
    const signal = radarRankedRowToStocksistSignal(row, source);
    if (!signal || seen.has(signal.id)) continue;
    seen.add(signal.id);
    out.push(signal);
  }
  return out;
}
