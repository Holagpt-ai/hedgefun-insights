import type { PriceAlertCondition, PriceAlertRecurrence, PriceAlertStatus, QuoteDataLatency } from "./types";

export interface UserPriceAlertRow {
  id: string;
  user_id: string;
  symbol: string;
  condition_type: PriceAlertCondition;
  threshold: number;
  reference_price: number | null;
  note: string | null;
  status: PriceAlertStatus;
  recurrence: PriceAlertRecurrence;
  cooldown_minutes: number;
  armed: boolean;
  last_observed_price: number | null;
  last_triggered_at: string | null;
  last_evaluated_at: string | null;
  last_quote_price: number | null;
  last_quote_at: string | null;
  data_latency: QuoteDataLatency | "unknown";
  market_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PriceAlertView {
  id: string;
  symbol: string;
  condition: PriceAlertCondition;
  value: number;
  note?: string;
  enabled: boolean;
  recurrence: PriceAlertRecurrence;
  lastTriggeredAt: string | null;
  lastQuotePrice: number | null;
  lastQuoteAt: string | null;
  dataLatency: QuoteDataLatency | "unknown";
  createdAt: string;
  updatedAt: string;
}

export function rowToView(row: UserPriceAlertRow): PriceAlertView {
  return {
    id: row.id,
    symbol: row.symbol,
    condition: row.condition_type,
    value: Number(row.threshold),
    note: row.note ?? undefined,
    enabled: row.status === "active",
    recurrence: row.recurrence,
    lastTriggeredAt: row.last_triggered_at,
    lastQuotePrice: row.last_quote_price != null ? Number(row.last_quote_price) : null,
    lastQuoteAt: row.last_quote_at,
    dataLatency: row.data_latency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
