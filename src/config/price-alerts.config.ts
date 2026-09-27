import type { PriceAlertCondition } from "@/lib/price-alerts/types";

export type { PriceAlertCondition, PriceAlertRecurrence, PriceAlertStatus } from "@/lib/price-alerts/types";

/** @deprecated Preview localStorage — legacy browser-only alerts. */
export const PRICE_ALERTS_STORAGE_KEY = "stocksist_price_alerts_preview";
export const LEGACY_PRICE_ALERTS_STORAGE_KEY = "hedgefun_price_alerts_preview";

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

/** UI view shape (maps from user_price_alerts). */
export interface PriceAlert {
  id: string;
  symbol: string;
  condition: PriceAlertCondition;
  value: number;
  note?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string | null;
  lastQuotePrice?: number | null;
  dataLatency?: string;
}

export const PRICE_ALERTS_COPY = {
  dataBadge: "Delayed market data",
  banner:
    "Alerts use verified Polygon snapshots (typically delayed ~15 min). They fire on threshold crossings, not every tick. In-app notifications only in V1.",
  footerDisclaimer:
    "Price alerts are deterministic thresholds on delayed data — not real-time execution signals. Not financial advice.",
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
