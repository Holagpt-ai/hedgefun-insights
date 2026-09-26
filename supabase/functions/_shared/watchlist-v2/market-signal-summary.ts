// Deterministic Watchlist Market Signal — not an AI score.
// Labels are a single rollup for UI; underlying market_signals remain authoritative.

import type { Direction, MarketSignal, RvolClass } from "./contract.ts";
import type { RadarScannerContext } from "./radar-context.ts";

export type WatchlistMarketSignalLabel =
  | "BULLISH"
  | "MOMENTUM"
  | "NEUTRAL"
  | "WEAKENING"
  | "BEARISH"
  | "UNAVAILABLE";

export type WatchlistMarketSignalSummary = {
  label: WatchlistMarketSignalLabel;
  /** Stable rule id for tests/telemetry. */
  rule_id: string;
};

export type MarketSignalSummaryInput = {
  direction: Direction;
  change_pct: number | null;
  price: number | null;
  rvol_class: RvolClass | null;
  market_signals: MarketSignal[];
  radar_context: RadarScannerContext | null;
};

function participationState(ctx: RadarScannerContext | null): string | null {
  return ctx?.participation?.participation_state ?? null;
}

function hasSignal(ids: Set<string>, signals: MarketSignal[]): boolean {
  return signals.some((s) => ids.has(s.signal_id));
}

/**
 * Priority (first match wins):
 * 1. UNAVAILABLE — no price or direction data_unavailable
 * 2. BEARISH — bearish direction OR (below VWAP and change ≤ -1%)
 * 3. WEAKENING — participation COOLING OR (neutral + change < 0)
 * 4. MOMENTUM — participation SURGING/RISING OR unusual RVOL OR (|change| ≥ 5% and elevated/unusual RVOL)
 * 5. BULLISH — bullish direction with change ≥ 0
 * 6. NEUTRAL — default
 */
export function deriveWatchlistMarketSignalSummary(
  input: MarketSignalSummaryInput,
): WatchlistMarketSignalSummary {
  if (input.direction === "data_unavailable" || input.price === null) {
    return { label: "UNAVAILABLE", rule_id: "unavailable_no_price" };
  }

  const change = input.change_pct;
  const part = participationState(input.radar_context);
  const signalIds = new Set(input.market_signals.map((s) => s.signal_id));
  const belowVwap = hasSignal(new Set(["price_below_vwap"]), input.market_signals);
  const aboveVwap = hasSignal(new Set(["price_above_vwap"]), input.market_signals);

  if (input.direction === "bearish" || (belowVwap && change !== null && change <= -1)) {
    return { label: "BEARISH", rule_id: "bearish_direction_or_vwap_loss" };
  }

  if (part === "COOLING" || (input.direction === "neutral" && change !== null && change < 0)) {
    return { label: "WEAKENING", rule_id: "cooling_or_neutral_down" };
  }

  const rvolHot = input.rvol_class === "unusual" || input.rvol_class === "elevated";
  if (
    part === "SURGING" ||
    part === "RISING" ||
    input.rvol_class === "unusual" ||
    (change !== null && Math.abs(change) >= 5 && rvolHot)
  ) {
    return { label: "MOMENTUM", rule_id: "participation_or_volume_momentum" };
  }

  if (input.direction === "bullish" && (change === null || change >= 0) && (aboveVwap || change !== null && change > 0)) {
    return { label: "BULLISH", rule_id: "bullish_with_positive_bias" };
  }

  if (input.direction === "bullish") {
    return { label: "BULLISH", rule_id: "bullish_direction" };
  }

  return { label: "NEUTRAL", rule_id: "neutral_default" };
}
