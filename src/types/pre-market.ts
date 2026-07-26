// Typed client contract for the Pre-Market workspace aggregator.
// Mirrors supabase/functions/_shared/pre-market/contract.ts (contract_version 1).

export type SectionStatus = "available" | "empty" | "stale" | "unavailable";

export interface SectionEnvelope<T> {
  status: SectionStatus;
  data: T;
  as_of: string | null;
  reason_code: string | null;
}

export type MarketContextStatus =
  | "premarket"
  | "regular"
  | "afterhours"
  | "closed"
  | "non_trading_day"
  | "unavailable";

export interface MarketContext {
  status: MarketContextStatus;
  et_date: string;
  et_time: string;
  checked_at: string;
  source: "polygon_marketstatus" | null;
  reason_code: string | null;
  official_open_at: string | null;
  official_close_at: string | null;
  next_known_session_at: string | null;
}

export interface PreMarketIndex {
  symbol: string;
  /** Per-symbol availability — an absent index is disclosed, never omitted. */
  status: "available" | "unavailable";
  name: string | null;
  value: number | null;
  change_percent: number | null;
  change_amount: number | null;
  updated_at: string | null;
  stale: boolean;
}

/** Validated, authorized Watchlist V2 signal (complete contract). */
export interface PreMarketSignal {
  signal_id: string;
  label: string;
  category: "trend" | "level" | "volume" | "range";
  kind: "state" | "transition";
  direction: "bullish" | "bearish" | "neutral" | null;
  facts: Record<string, number | string | boolean>;
  inputs: string[];
  observed_at: string;
  rule_version: "w2b1c.1";
}

export interface PreMarketWatchlistRow {
  ticker: string;
  company_name: string | null;
  direction: "bullish" | "bearish" | "neutral" | "data_unavailable" | string;
  explanation: string;
  failure_reason: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  rvol: number | null;
  rvol_class: string | null;
  market_signals: PreMarketSignal[];
  session_date: string | null;
  analyzed_at: string | null;
  valid_through: string | null;
  awaiting_refresh: boolean;
  request_status: "pending" | "succeeded" | "failed" | null;
}

/** Honest lifecycle disclosure for watchlist symbols without a current analysis. */
export interface PreMarketLifecycleEntry {
  ticker: string;
  label: string;
}

export interface PreMarketAttentionItem {
  id: string;
  symbol: string | null;
  kind: string;
  label: string;
  detail: string | null;
  route: string | null;
}

export interface PreMarketCatalyst {
  id: string;
  symbol: string;
  company_name: string | null;
  /** Persisted ingestion provider — the ONLY earnings-calendar discriminator. */
  provider: string;
  verification_state: string;
  event_type: string;
  event_date: string;
  event_time: string | null;
  time_of_day: "before_open" | "after_close" | "during" | null;
  title: string;
  source_name: string | null;
  source_url: string | null;
  published_at: string | null;
}

export interface PreMarketEarnings {
  id: string;
  symbol: string;
  company_name: string | null;
  /** Must be "earnings_calendar" for a confirmed scheduled earnings event. */
  provider: string;
  verification_state: string;
  event_date: string;
  time_of_day: "before_open" | "after_close" | "during" | null;
  title: string;
  /** Persisted ingestion fact keys. Never synthesized. */
  estimate_eps: number | null;
  actual_eps: number | null;
  surprise_percent: number | null;
  source_name: string | null;
  source_url: string | null;
}

export interface PreMarketVolumeLeader {
  symbol: string;
  company_name: string | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  rvol: number | null;
  updated_at: string | null;
}

export interface JournalReadiness {
  open_trades: number;
  missing_stop: number;
  missing_target: number;
  symbols: Array<{
    symbol: string;
    side: string;
    qty: number | null;
    missing_stop: boolean;
    missing_target: boolean;
  }>;
}

export interface PreMarketHeadline {
  id: string;
  headline: string;
  source: string | null;
  url: string | null;
  published_at: string;
}

export interface PreMarketChecklistItem {
  id: string;
  label: string;
  count: number;
  route: string | null;
}

export interface PreMarketWorkspaceResponse {
  contract_version: 1;
  server_now: string;
  market_context: MarketContext;
  /** Total CONFIRMED before-open earnings-calendar events for the ET date. */
  earnings_confirmed_total: number;
  /** Lifecycle state for watchlist symbols excluded from the current session view. */
  watchlist_lifecycle: PreMarketLifecycleEntry[];
  /** False when the alerts query failed — derived sections must fail closed. */
  alerts_included: boolean;
  indexes: SectionEnvelope<PreMarketIndex[]>;
  watchlist_activity: SectionEnvelope<PreMarketWatchlistRow[]>;
  risk_attention: SectionEnvelope<PreMarketAttentionItem[]>;
  catalyst_watch: SectionEnvelope<PreMarketCatalyst[]>;
  earnings: SectionEnvelope<PreMarketEarnings[]>;
  volume_leaders: SectionEnvelope<PreMarketVolumeLeader[]>;
  journal_readiness: SectionEnvelope<JournalReadiness>;
  headlines: SectionEnvelope<PreMarketHeadline[]>;
  checklist: SectionEnvelope<PreMarketChecklistItem[]>;
}
