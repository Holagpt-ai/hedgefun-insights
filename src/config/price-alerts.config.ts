// Price Alerts V1 — frontend-only preview config.
// No backend, no delivery. All alerts live in localStorage.

export const PRICE_ALERTS_STORAGE_KEY = "hedgefun_price_alerts_preview";

export type PriceAlertCondition =
  | "price_above"
  | "price_below"
  | "percent_move_up"
  | "percent_move_down";

export interface PriceAlertConditionOption {
  value: PriceAlertCondition;
  label: string;
  hint: string;
  unit: "$" | "%";
}

export const PRICE_ALERT_CONDITIONS: PriceAlertConditionOption[] = [
  { value: "price_above",       label: "Price above",  hint: "Trigger when last price rises above the value.", unit: "$" },
  { value: "price_below",       label: "Price below",  hint: "Trigger when last price falls below the value.", unit: "$" },
  { value: "percent_move_up",   label: "% move up",    hint: "Trigger on an upward % move from reference.",    unit: "%" },
  { value: "percent_move_down", label: "% move down",  hint: "Trigger on a downward % move from reference.",   unit: "%" },
];

// Not built in V1 — surfaced as disabled placeholders only.
export const COMING_LATER_CONDITIONS: { label: string; note: string }[] = [
  { label: "Volume / RVOL",   note: "Coming later" },
  { label: "Catalyst-driven", note: "Coming later" },
];

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: PriceAlertCondition;
  value: number;
  note?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PRICE_ALERTS_COPY = {
  previewBadge: "Preview mode",
  previewBanner:
    "Alerts are saved locally in this browser and are not delivered yet. Market data may be delayed. Verify prices before trading.",
  footerDisclaimer:
    "Price alerts are a planning tool. Alerts may be delayed or unavailable until backend delivery is connected. Not financial advice.",
};

export function conditionLabel(c: PriceAlertCondition): string {
  return PRICE_ALERT_CONDITIONS.find((o) => o.value === c)?.label ?? c;
}

export function conditionUnit(c: PriceAlertCondition): "$" | "%" {
  return PRICE_ALERT_CONDITIONS.find((o) => o.value === c)?.unit ?? "$";
}

export function formatAlertValue(c: PriceAlertCondition, v: number): string {
  const unit = conditionUnit(c);
  return unit === "$" ? `$${v.toFixed(2)}` : `${v.toFixed(2)}%`;
}
