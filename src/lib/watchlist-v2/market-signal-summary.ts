// Browser mirror of supabase/functions/_shared/watchlist-v2/market-signal-summary.ts

export type WatchlistMarketSignalLabel =
  | "BULLISH"
  | "MOMENTUM"
  | "NEUTRAL"
  | "WEAKENING"
  | "BEARISH"
  | "UNAVAILABLE";

export type WatchlistMarketSignalSummary = {
  label: WatchlistMarketSignalLabel;
  rule_id: string;
};

export type ScannerParticipation = {
  time_adjusted_rvol: number | null;
  volume_5m: number | null;
  volume_15m: number | null;
  volume_60m: number | null;
  volume_velocity_5m: number | null;
  volume_velocity_15m: number | null;
  volume_velocity_60m: number | null;
  dollar_volume_velocity_5m: number | null;
  participation_state: string | null;
  baseline_session_count: number | null;
};

export type ScannerIntelligence = {
  primary_event: string | null;
  promotion_primary_event: string | null;
  radar_event_lifecycle: string | null;
  volume_acceleration_pct: number | null;
  participation: ScannerParticipation | null;
};

export type VerifiedRecentEvent = {
  kind: "radar" | "news" | "earnings";
  title: string;
  at: string | null;
};

export type WatchlistDirection = "bullish" | "bearish" | "neutral" | "data_unavailable";
export type RvolClass = "normal" | "elevated" | "unusual";

export type MarketSignalSummaryInput = {
  direction: WatchlistDirection;
  change_pct: number | null;
  price: number | null;
  rvol_class: RvolClass | null;
  signal_ids: string[];
  participation_state: string | null;
};

function hasSignal(id: string, ids: string[]): boolean {
  return ids.includes(id);
}

export function deriveWatchlistMarketSignalSummary(
  input: MarketSignalSummaryInput,
): WatchlistMarketSignalSummary {
  if (input.direction === "data_unavailable" || input.price === null) {
    return { label: "UNAVAILABLE", rule_id: "unavailable_no_price" };
  }

  const change = input.change_pct;
  const part = input.participation_state;
  const belowVwap = hasSignal("price_below_vwap", input.signal_ids);
  const aboveVwap = hasSignal("price_above_vwap", input.signal_ids);

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

  if (input.direction === "bullish" && (change === null || change >= 0) && (aboveVwap || (change !== null && change > 0))) {
    return { label: "BULLISH", rule_id: "bullish_with_positive_bias" };
  }

  if (input.direction === "bullish") {
    return { label: "BULLISH", rule_id: "bullish_direction" };
  }

  return { label: "NEUTRAL", rule_id: "neutral_default" };
}
