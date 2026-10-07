import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";

export type StocksistSignalSource = "radar" | "catalyst" | "continuation";

function signalTimestamp(row: RadarRankedRow): string {
  return (
    row.promoted_at ??
    row.primary_scanner_event_at ??
    row.provider_as_of ??
    row.updated_at
  );
}

export function stableRadarSignalId(row: RadarRankedRow, source: StocksistSignalSource): string {
  return `${source}-${row.symbol.toUpperCase()}-${signalTimestamp(row)}`;
}

/** Maps Day Trade Radar / screener row fields into execution-domain StocksistSignal. */
export function radarRankedRowToStocksistSignal(
  row: RadarRankedRow,
  source: StocksistSignalSource = "radar",
): StocksistSignal | null {
  const symbol = row.symbol?.trim().toUpperCase();
  const triggerPrice = row.price;
  if (!symbol || triggerPrice == null || !Number.isFinite(triggerPrice) || triggerPrice <= 0) {
    return null;
  }

  const ts = signalTimestamp(row);
  const hodPct =
    row.distance_from_hod_pct ?? row.hod_distance_percent ?? null;
  const rvol = row.rvol_5m ?? row.rvol ?? row.time_adjusted_rvol ?? null;
  const movePct = row.change_percent;
  const catalystId =
    source === "catalyst"
      ? (row.promotion_reason != null ? String(row.promotion_reason) : row.primary_scanner_event)
      : row.primary_scanner_event;

  const thesisParts = [
    row.signal,
    row.primary_scanner_event,
    row.opportunity_explain?.reasons?.[0],
  ].filter(Boolean);

  const stop = triggerPrice * 0.97;
  const target =
    row.day_high != null && Number.isFinite(row.day_high) && row.day_high > triggerPrice
      ? row.day_high
      : triggerPrice * 1.04;

  return {
    id: stableRadarSignalId(row, source),
    symbol,
    strategyId:
      source === "continuation"
        ? "STOCKSIST_CONTINUATION_V1"
        : source === "catalyst"
          ? "CATALYST_MOMENTUM_V1"
          : "DAY_TRADE_RADAR_V1",
    side: "buy",
    triggerPrice,
    suggestedQuantity: triggerPrice > 0 ? Math.max(1, Math.floor(2500 / triggerPrice)) : null,
    suggestedNotional: null,
    stopLossPrice: stop,
    profitTargetPrice: target,
    eventType: row.primary_scanner_event ?? row.signal ?? null,
    catalystId: catalystId ?? null,
    volume: row.volume ?? row.rolling_volume_60s ?? null,
    rvol: rvol != null && Number.isFinite(Number(rvol)) ? Number(rvol) : null,
    momentumScore: row.opportunity_score ?? null,
    aboveVwap: row.vwap_side ? row.vwap_side.toLowerCase().includes("above") : row.session_vwap != null ? row.price != null && row.session_vwap != null && row.price >= row.session_vwap : null,
    hodProximityPct: hodPct != null && Number.isFinite(Number(hodPct)) ? Number(hodPct) : null,
    floatTurnover: row.float_shares != null && row.volume != null && row.float_shares > 0
      ? row.volume / row.float_shares
      : null,
    historicalContext: row.historicalContext?.currentSymbol
      ? `Historical context for ${row.historicalContext.currentSymbol}`
      : null,
    thesisSummary: thesisParts.join(" · ") || null,
    signalAt: ts,
    metadata: {
      source,
      radar_rank: row.rank,
      day_trade_rank: row.day_trade_rank ?? null,
      move_pct: movePct,
      freshness: row.freshness_class ?? null,
    },
  };
}
