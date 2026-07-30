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
      "stocks priced $2–$20, up at least 10%, and trading at least 5× prior-session volume; ranked by current volume.",
    criteria: ["Price $2–$20", "Up ≥10%", "Current vol ≥5× prior session"],
    featured: true,
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "price", label: "Last", format: "price", align: "right" },
      { key: "change_percent", label: "Move", format: "percent", align: "right" },
      { key: "day_range", label: "Day Range", format: "text", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "Prior Vol", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "Vol / Prior", format: "multiplier", align: "right" },
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
      "current-session volume at least 3× prior-session volume; ranked by current volume.",
    criteria: ["Current vol ≥3× prior session"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "Prior Vol", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "Vol / Prior", format: "multiplier", align: "right" },
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
      "A validated 52-week baseline is not connected yet. No securities are being inferred.",
    criteria: [],
    unimplemented: true,
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
    id: "unusual_volume",
    label: "Unusual Volume",
    description:
      "current-session volume at least 4× prior-session volume; ranked by current volume.",
    criteria: ["Current vol ≥4× prior session"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "prior_session_volume", label: "Prior Vol", format: "volume", align: "right" },
      { key: "volume_ratio_prior_session", label: "Vol / Prior", format: "multiplier", align: "right" },
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
