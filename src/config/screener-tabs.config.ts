// ─────────────────────────────────────────────────────────────────────────────
// HedgeFun Dashboard Screeners — Tab Registry
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnFormat = "text" | "price" | "percent" | "multiplier" | "volume" | "shares";

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
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "Move", format: "percent", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "volume", label: "Day Vol", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "Prior Day Vol", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "Vol / Prior Day", format: "multiplier", align: "right" },
      { key: "catalyst_news", label: "Catalyst / News", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "gappers",
    label: "Gappers",
    description: "Gap >5% from prior close. Ranked by current volume.",
    criteria: ["Gap >5% from prior close"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "gap_percent", label: "Gap %", format: "percent", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "catalyst_news", label: "Catalyst / News", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "volume_spikes",
    label: "Volume Spikes",
    description:
      "provider day volume at least 3× provider prior-day volume (may include extended-session activity); ranked by provider day volume.",
    criteria: ["Provider day vol ≥3× prior day vol"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "volume", label: "Day Vol", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "Prior Day Vol", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "Vol / Prior Day", format: "multiplier", align: "right" },
      { key: "change_percent", label: "Move", format: "percent", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "catalyst_news", label: "Catalyst / News", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "gainers_losers",
    label: "Gainers / Losers",
    description: "Provider-reported gainers and losers. Ranked by current volume.",
    criteria: [],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "Move", format: "percent", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "catalyst_news", label: "Catalyst / News", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "new_highs_lows",
    label: "New Highs / Lows",
    description:
      "Current regular-session day high or low at or beyond a validated prior 52-week baseline. Ranked by current volume. Event type does not override volume.",
    criteria: [
      "Prior 52-week baseline required",
      "Day high ≥ prior 52W high or day low ≤ prior 52W low",
      "Positive current volume and price",
    ],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "range_event", label: "Event", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "Move", format: "percent", align: "right" },
      { key: "high_52w", label: "Prior 52W High", format: "price", align: "right" },
      { key: "low_52w", label: "Prior 52W Low", format: "price", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "catalyst_news", label: "Catalyst", format: "text", align: "left" },
      { key: "actions", label: "Actions", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
  {
    id: "unusual_volume",
    label: "Unusual Volume",
    description:
      "provider day volume at least 4× provider prior-day volume (may include extended-session activity); ranked by provider day volume.",
    criteria: ["Provider day vol ≥4× prior day vol"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "volume", label: "Day Vol", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "Prior Day Vol", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "Vol / Prior Day", format: "multiplier", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "catalyst_news", label: "Catalyst / News", format: "text", align: "left" },
    ],
    freeRowLimit: 2,
  },
];

export const DEFAULT_SCREENER_TAB_ID = "day_trade_radar";

export function getScreenerTabById(id: string): ScreenerTab | undefined {
  return SCREENER_TABS.find((tab) => tab.id === id);
}
