// ─────────────────────────────────────────────────────────────────────────────
// Stocksist Dashboard Screeners — Tab Registry
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnFormat =
  | "text"
  | "price"
  | "percent"
  | "multiplier"
  | "volume"
  | "shares"
  | "dollar_volume"
  | "daily_rvol"
  | "rank"
  | "trade_quality"
  | "trigger_time"
  | "rvol_5m"
  | "vol_velocity"
  | "vol_acceleration"
  | "unavailable";

export interface ScreenerColumn {
  key: string;
  label: string;
  format: ColumnFormat;
  align?: "left" | "right";
}

export interface ScreenerTab {
  id: string;
  label: string;
  description: string;
  criteria: string[];
  featured?: boolean;
  unimplemented?: boolean;
  columns: ScreenerColumn[];
  freeRowLimit: number;
}

export const SCREENER_TABS: ScreenerTab[] = [
  {
    id: "day_trade_radar",
    label: "Day Trade Radar",
    description:
      "stocks priced $2–$20, up at least 10% on the regular session (day close vs prior close), and trading at least 5× provider prior-day volume; ranked by provider day volume (may include extended-session activity).",
    criteria: [
      "Price $2–$20",
      "Regular-session up ≥10%",
      "Provider day vol ≥5× prior day vol",
    ],
    featured: true,
    columns: [
      { key: "trigger_time", label: "Triggered", format: "trigger_time", align: "left" },
      { key: "discovery_rank", label: "Rank", format: "rank", align: "left" },
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "MOVE", format: "percent", align: "right" },
      { key: "volume", label: "TODAY VOL", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "YDAY VOL", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "VOL/YDAY", format: "multiplier", align: "right" },
      { key: "dollar_volume", label: "$ Volume", format: "dollar_volume", align: "right" },
      { key: "rvol_5m", label: "5m RVOL", format: "rvol_5m", align: "right" },
      { key: "vol_velocity", label: "Vol Velocity", format: "vol_velocity", align: "right" },
      { key: "acceleration", label: "Acceleration", format: "vol_acceleration", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "catalyst_news", label: "Catalyst", format: "text", align: "left" },
      { key: "history", label: "HISTORY", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "gappers",
    label: "Gappers",
    description: "Gap ≥5% up or down from prior close. Ranked by current volume.",
    criteria: ["Gap ≥5% up or down from prior close"],
    columns: [
      { key: "trigger_time", label: "Triggered", format: "trigger_time", align: "left" },
      { key: "discovery_rank", label: "Rank", format: "rank", align: "left" },
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "gap_percent", label: "Gap %", format: "percent", align: "right" },
      { key: "volume", label: "TODAY VOL", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "YDAY VOL", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "VOL/YDAY", format: "multiplier", align: "right" },
      { key: "rvol_5m", label: "5m RVOL", format: "rvol_5m", align: "right" },
      { key: "catalyst_news", label: "Catalyst", format: "text", align: "left" },
      { key: "history", label: "HISTORY", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "volume_spikes",
    label: "Volume Spikes",
    description:
      "Short-window volume acceleration. Radar: verified 5-minute velocity or acceleration, ranked by high-activity participation then velocity. Fallback: provider day volume at least 3× prior-day volume, ranked by day volume.",
    criteria: [
      "Radar: positive session volume plus 5-minute velocity or acceleration",
      "Fallback: provider day vol ≥3× prior day vol",
    ],
    columns: [
      { key: "trigger_time", label: "Triggered", format: "trigger_time", align: "left" },
      { key: "discovery_rank", label: "Rank", format: "rank", align: "left" },
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "MOVE", format: "percent", align: "right" },
      { key: "volume", label: "TODAY VOL", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "YDAY VOL", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "VOL/YDAY", format: "multiplier", align: "right" },
      { key: "rvol_5m", label: "5m RVOL", format: "rvol_5m", align: "right" },
      { key: "vol_velocity", label: "Velocity", format: "vol_velocity", align: "right" },
      { key: "catalyst_news", label: "Catalyst", format: "text", align: "left" },
      { key: "history", label: "HISTORY", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "gainers_losers",
    label: "Gainers / Losers",
    description:
      "Session percentage move versus the previous regular-session close. Ranked by |MOVE| with volume as the tie-break. High-activity names (≥100k shares/min) stay ahead of thin prints.",
    criteria: [],
    columns: [
      { key: "trigger_time", label: "Triggered", format: "trigger_time", align: "left" },
      { key: "discovery_rank", label: "Rank", format: "rank", align: "left" },
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "MOVE", format: "percent", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "dollar_volume", label: "$ Volume", format: "dollar_volume", align: "right" },
      { key: "rvol_20d", label: "RVOL 20D", format: "daily_rvol", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "catalyst_news", label: "Catalyst", format: "text", align: "left" },
      { key: "history", label: "HISTORY", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "new_highs_lows",
    label: "New Highs / Lows",
    description:
      "Current regular-session day high or low at or beyond a validated prior 52-week baseline with at least 120 observed sessions. Ranked by current volume. Event type does not override volume. Incomplete history is never shown as a verified breakout.",
    criteria: [
      "Prior 52-week baseline required (≥120 sessions)",
      "Day high ≥ prior 52W high or day low ≤ prior 52W low",
      "Positive current volume and price",
    ],
    columns: [
      { key: "trigger_time", label: "Triggered", format: "trigger_time", align: "left" },
      { key: "discovery_rank", label: "Rank", format: "rank", align: "left" },
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "MOVE", format: "percent", align: "right" },
      { key: "range_event", label: "Event", format: "text", align: "left" },
      { key: "volume", label: "TODAY VOL", format: "volume", align: "right" },
      { key: "high_52w", label: "Prior 52W High", format: "price", align: "right" },
      { key: "low_52w", label: "Prior 52W Low", format: "price", align: "right" },
      { key: "nhl_distance", label: "Distance", format: "text", align: "right" },
      { key: "catalyst_news", label: "Catalyst", format: "text", align: "left" },
      { key: "history", label: "HISTORY", format: "text", align: "left" },
      { key: "actions", label: "Actions", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "unusual_volume",
    label: "Unusual Volume",
    description:
      "Unusual cumulative session volume versus a verified comparison baseline. Radar: VOL/YDAY ≥4× or time-adjusted RVOL ≥2×, ranked by high-activity participation then TARVOL/VOL/YDAY. Fallback: provider day volume at least 4× prior-day volume.",
    criteria: [
      "Radar: session vol / prior session ≥4×, or time-adjusted RVOL ≥2×",
      "Fallback: provider day vol ≥4× prior day vol",
    ],
    columns: [
      { key: "trigger_time", label: "Triggered", format: "trigger_time", align: "left" },
      { key: "discovery_rank", label: "Rank", format: "rank", align: "left" },
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "MOVE", format: "percent", align: "right" },
      { key: "volume", label: "TODAY VOL", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "YDAY VOL", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "VOL/YDAY", format: "multiplier", align: "right" },
      { key: "rvol_5m", label: "5m RVOL", format: "rvol_5m", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "catalyst_news", label: "Catalyst", format: "text", align: "left" },
      { key: "history", label: "HISTORY", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
];

export const DEFAULT_SCREENER_TAB_ID = "day_trade_radar";

export function getScreenerTabById(id: string): ScreenerTab | undefined {
  return SCREENER_TABS.find((tab) => tab.id === id);
}
