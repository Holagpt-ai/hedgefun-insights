// Types for the Action Center command hub. No score/confidence/rank concepts.

export type FeedBucket = "now" | "today" | "upcoming" | "open_position";

export type FeedSource = "watchlist_alert" | "catalyst_saved" | "catalyst_upcoming" | "open_trade";

export interface ActionFeedItem {
  key: string;
  bucket: FeedBucket;
  source: FeedSource;
  symbol: string;
  title: string;
  detail: string | null;
  timestampMs: number;
  timestampLabel: string;
  sourceLabel: string;
  eventId?: string;
  sourceUrl?: string | null;
}

export interface WatchlistAlertRow {
  id: string;
  ticker: string;
  alert_type: string;
  reason: string;
  facts: Record<string, unknown> | null;
  event_time: string;
  session_date: string;
  dedupe_key: string;
  created_at: string;
}

export interface WatchlistAnalysisRow {
  ticker: string;
  direction: "bullish" | "bearish" | "neutral" | "data_unavailable";
  failure_reason: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  rvol: number | null;
  rvol_class: "normal" | "elevated" | "unusual" | null;
  session_type: "premarket" | "rth" | "postclose";
  session_date: string;
  analyzed_at: string;
  valid_through: string;
}

export interface OpenTradeRow {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  entry_price: number;
  entry_date: string;
  status: "open" | "closed";
}

export interface ScreenerLeader {
  symbol: string;
  company_name: string | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  rvol: number | null;
  updated_at: string;
}

export interface SummaryCounts {
  watchlistAlerts: number;
  unusualActivity: number;
  catalystEvents: number;
  openTrades: number;
}

export interface WatchlistSnapshot {
  bullish: number;
  bearish: number;
  neutral: number;
  dataUnavailable: number;
  awaitingRefresh: number;
}

export interface FocusTask {
  id: string;
  label: string;
  count: number;
  route: string;
}
