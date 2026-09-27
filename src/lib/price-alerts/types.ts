/** User-owned price alerts V1 — shared condition types (keep in sync with DB check constraints). */

export type PriceAlertCondition =
  | "price_above"
  | "price_below"
  | "percent_move_up"
  | "percent_move_down";

export type PriceAlertStatus = "active" | "paused";
export type PriceAlertRecurrence = "one_time" | "recurring";
export type QuoteDataLatency = "live_delayed" | "previous_close" | "stale" | "unavailable";

export const PRICE_ALERT_CONDITIONS = [
  { value: "price_above" as const, label: "Price above", unit: "$" as const },
  { value: "price_below" as const, label: "Price below", unit: "$" as const },
  { value: "percent_move_up" as const, label: "% move up", unit: "%" as const },
  { value: "percent_move_down" as const, label: "% move down", unit: "%" as const },
];

export const DEFAULT_COOLDOWN_MINUTES = 60;
export const QUOTE_STALE_MS = 20 * 60 * 1000;
