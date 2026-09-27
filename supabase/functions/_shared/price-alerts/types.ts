export type PriceAlertCondition =
  | "price_above"
  | "price_below"
  | "percent_move_up"
  | "percent_move_down";

export type PriceAlertStatus = "active" | "paused";
export type PriceAlertRecurrence = "one_time" | "recurring";
export type QuoteDataLatency =
  | "unknown"
  | "live_delayed"
  | "previous_close"
  | "stale"
  | "unavailable";

export const DEFAULT_COOLDOWN_MINUTES = 60;
export const QUOTE_STALE_MS = 20 * 60 * 1000;
