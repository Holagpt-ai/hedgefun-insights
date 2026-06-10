// ─────────────────────────────────────────────────────────────────────────────
// HedgeFun Dashboard Screeners — Tab Registry
// ─────────────────────────────────────────────────────────────────────────────
// This is the SINGLE SOURCE OF TRUTH for the dashboard momentum screeners.
// It is SEPARATE from src/components/screener/filters.config.ts (the public
// stock-filter tool). Do not merge the two.
// ─────────────────────────────────────────────────────────────────────────────

export type ScreenerTier = "free" | "pro";
export type BadgeKind = "live" | "delayed";

export type ColumnFormat =
  | "text"
  | "price"
  | "percent"
  | "volume"
  | "multiplier"
  | "shares";

export interface ColumnDef {
  key: string;
  label: string;
  align: "left" | "right";
  format: ColumnFormat;
}

export type RuleOperator = "gt" | "gte" | "lt" | "lte" | "between" | "eq";
export type RuleUnit = "usd" | "percent" | "shares" | "multiplier" | "count";

export interface FilterRule {
  field: string;
  operator: RuleOperator;
  value: number | [number, number];
  unit?: RuleUnit;
}

export type DataSourceMode = "placeholder" | "live";
export type DataProvider = "polygon" | "fiscal_ai" | null;

export interface DataSourceDef {
  mode: DataSourceMode;
  provider: DataProvider;
  endpoint: string | null;
  refreshSeconds: number | null;
}

export interface ScreenerTab {
  id: string;
  label: string;
  description: string;
  tier: ScreenerTier;
  freeRowLimit: number;
  badge: BadgeKind;
  featured?: boolean;
  criteria: string[];
  filterRules: FilterRule[];
  columns: ColumnDef[];
  dataSource: DataSourceDef;
  rows: Record<string, string | number>[];
}

const PLACEHOLDER_SOURCE: DataSourceDef = {
  mode: "placeholder",
  provider: null,
  endpoint: null,
  refreshSeconds: null,
};

export const SCREENER_TABS: ScreenerTab[] = [
  {
    id: "day-trade-radar",
    label: "Day Trade Radar",
    description:
      "Low-float runners already in motion — the momentum setup day traders scan for every morning.",
    tier: "pro",
    freeRowLimit: 0,
    badge: "delayed",
    featured: true,
    criteria: ["Price $2–$20", "Float < 10M", "Up > 10%", "RVOL ≥ 5×"],
    filterRules: [
      { field: "price", operator: "between", value: [2, 20], unit: "usd" },
      { field: "float", operator: "lt", value: 10000000, unit: "shares" },
      { field: "change", operator: "gt", value: 10, unit: "percent" },
      { field: "rvol", operator: "gte", value: 5, unit: "multiplier" },
    ],
    columns: [
      { key: "symbol", label: "Symbol", align: "left", format: "text" },
      { key: "price", label: "Price", align: "right", format: "price" },
      { key: "change", label: "% Chg", align: "right", format: "percent" },
      { key: "float", label: "Float", align: "right", format: "shares" },
      { key: "rvol", label: "RVOL", align: "right", format: "multiplier" },
      { key: "hod_dist", label: "HOD Dist", align: "right", format: "percent" },
    ],
    dataSource: PLACEHOLDER_SOURCE,
    rows: [
      { symbol: "GPUS", price: 4.82, change: 28.4, float: 6200000, rvol: 8.1, hod_dist: -2.1 },
      { symbol: "NSYS", price: 12.34, change: 19.7, float: 3100000, rvol: 6.9, hod_dist: -1.4 },
      { symbol: "VRPX", price: 3.15, change: 41.2, float: 8800000, rvol: 11.3, hod_dist: -0.8 },
      { symbol: "LRHC", price: 8.07, change: 14.6, float: 4500000, rvol: 5.4, hod_dist: -3.2 },
      { symbol: "BTAI", price: 6.49, change: 22.1, float: 9100000, rvol: 7.2, hod_dist: -1.9 },
      { symbol: "ELWS", price: 2.88, change: 33.8, float: 2700000, rvol: 9.6, hod_dist: -0.5 },
    ],
  },
  {
    id: "gappers",
    label: "Gappers",
    description: "Stocks opening significantly above or below the prior close.",
    tier: "pro",
    freeRowLimit: 3,
    badge: "delayed",
    criteria: ["Gap > 4%", "Pre-market volume > 100K"],
    filterRules: [
      { field: "gap", operator: "gt", value: 4, unit: "percent" },
      { field: "volume", operator: "gt", value: 100000, unit: "count" },
    ],
    columns: [
      { key: "symbol", label: "Symbol", align: "left", format: "text" },
      { key: "price", label: "Price", align: "right", format: "price" },
      { key: "gap", label: "Gap %", align: "right", format: "percent" },
      { key: "volume", label: "Pre Vol", align: "right", format: "volume" },
      { key: "float", label: "Float", align: "right", format: "shares" },
    ],
    dataSource: PLACEHOLDER_SOURCE,
    rows: [
      { symbol: "AVXL", price: 18.40, gap: 12.3, volume: 1450000, float: 42000000 },
      { symbol: "SOUN", price: 9.22, gap: 8.7, volume: 2100000, float: 88000000 },
      { symbol: "RGTI", price: 14.05, gap: 6.4, volume: 980000, float: 31000000 },
      { symbol: "IONQ", price: 33.10, gap: 5.1, volume: 760000, float: 25000000 },
      { symbol: "BBAI", price: 4.67, gap: 15.8, volume: 3300000, float: 67000000 },
      { symbol: "QBTS", price: 7.89, gap: 9.2, volume: 1900000, float: 54000000 },
    ],
  },
  {
    id: "volume-spikes",
    label: "Volume Spikes",
    description: "Unusual trading volume relative to the stock's daily average.",
    tier: "pro",
    freeRowLimit: 3,
    badge: "delayed",
    criteria: ["RVOL ≥ 3×", "Volume > 1M"],
    filterRules: [
      { field: "rvol", operator: "gte", value: 3, unit: "multiplier" },
      { field: "volume", operator: "gt", value: 1000000, unit: "count" },
    ],
    columns: [
      { key: "symbol", label: "Symbol", align: "left", format: "text" },
      { key: "price", label: "Price", align: "right", format: "price" },
      { key: "change", label: "% Chg", align: "right", format: "percent" },
      { key: "volume", label: "Volume", align: "right", format: "volume" },
      { key: "avg_volume", label: "Avg Vol", align: "right", format: "volume" },
      { key: "rvol", label: "RVOL", align: "right", format: "multiplier" },
    ],
    dataSource: PLACEHOLDER_SOURCE,
    rows: [
      { symbol: "PLTR", price: 42.30, change: 6.8, volume: 88000000, avg_volume: 22000000, rvol: 4.0 },
      { symbol: "MARA", price: 19.55, change: -4.2, volume: 54000000, avg_volume: 15000000, rvol: 3.6 },
      { symbol: "RIOT", price: 11.20, change: 5.1, volume: 41000000, avg_volume: 12000000, rvol: 3.4 },
      { symbol: "AFRM", price: 28.90, change: 9.3, volume: 33000000, avg_volume: 9000000, rvol: 3.7 },
      { symbol: "DKNG", price: 38.10, change: 3.2, volume: 28000000, avg_volume: 8500000, rvol: 3.3 },
      { symbol: "CVNA", price: 67.40, change: -6.7, volume: 19000000, avg_volume: 6000000, rvol: 3.2 },
    ],
  },
  {
    id: "gainers-losers",
    label: "Gainers / Losers",
    description: "The day's biggest movers in both directions.",
    tier: "pro",
    freeRowLimit: 3,
    badge: "delayed",
    criteria: ["Top % gainers", "Top % losers"],
    filterRules: [{ field: "change", operator: "gt", value: 0, unit: "percent" }],
    columns: [
      { key: "symbol", label: "Symbol", align: "left", format: "text" },
      { key: "price", label: "Price", align: "right", format: "price" },
      { key: "change", label: "% Chg", align: "right", format: "percent" },
      { key: "volume", label: "Volume", align: "right", format: "volume" },
      { key: "mkt_cap", label: "Mkt Cap", align: "right", format: "text" },
    ],
    dataSource: PLACEHOLDER_SOURCE,
    rows: [
      { symbol: "SMCI", price: 48.20, change: 18.4, volume: 31000000, mkt_cap: "$28.1B" },
      { symbol: "ARM", price: 142.50, change: 12.1, volume: 14000000, mkt_cap: "$149B" },
      { symbol: "COIN", price: 224.30, change: 9.7, volume: 11000000, mkt_cap: "$56B" },
      { symbol: "ENPH", price: 71.40, change: -14.2, volume: 9000000, mkt_cap: "$9.6B" },
      { symbol: "SEDG", price: 22.10, change: -11.8, volume: 7000000, mkt_cap: "$1.3B" },
      { symbol: "FSLR", price: 188.90, change: -8.3, volume: 5000000, mkt_cap: "$20B" },
    ],
  },
  {
    id: "new-highs-lows",
    label: "New Highs / Lows",
    description: "Stocks printing fresh 52-week highs or lows today.",
    tier: "pro",
    freeRowLimit: 3,
    badge: "delayed",
    criteria: ["At / near 52-week high", "At / near 52-week low"],
    filterRules: [{ field: "pct_from_high", operator: "gte", value: -1, unit: "percent" }],
    columns: [
      { key: "symbol", label: "Symbol", align: "left", format: "text" },
      { key: "price", label: "Price", align: "right", format: "price" },
      { key: "week_high", label: "52W High", align: "right", format: "price" },
      { key: "pct_from_high", label: "% from High", align: "right", format: "percent" },
      { key: "week_low", label: "52W Low", align: "right", format: "price" },
    ],
    dataSource: PLACEHOLDER_SOURCE,
    rows: [
      { symbol: "NVDA", price: 141.20, week_high: 141.50, pct_from_high: -0.2, week_low: 75.60 },
      { symbol: "META", price: 602.10, week_high: 602.80, pct_from_high: -0.1, week_low: 414.50 },
      { symbol: "AAPL", price: 232.40, week_high: 234.10, pct_from_high: -0.7, week_low: 164.10 },
      { symbol: "WBA", price: 8.90, week_high: 27.40, pct_from_high: -67.5, week_low: 8.80 },
      { symbol: "PARA", price: 10.20, week_high: 16.30, pct_from_high: -37.4, week_low: 10.10 },
      { symbol: "BMY", price: 49.80, week_high: 62.10, pct_from_high: -19.8, week_low: 49.50 },
    ],
  },
  {
    id: "unusual-volume",
    label: "Unusual Volume",
    description: "Volume far above the norm — early signal of institutional interest.",
    tier: "pro",
    freeRowLimit: 3,
    badge: "delayed",
    criteria: ["RVOL ≥ 2×", "Above-average dollar volume"],
    filterRules: [{ field: "rvol", operator: "gte", value: 2, unit: "multiplier" }],
    columns: [
      { key: "symbol", label: "Symbol", align: "left", format: "text" },
      { key: "price", label: "Price", align: "right", format: "price" },
      { key: "change", label: "% Chg", align: "right", format: "percent" },
      { key: "volume", label: "Volume", align: "right", format: "volume" },
      { key: "avg_volume", label: "Avg Vol", align: "right", format: "volume" },
      { key: "rvol", label: "RVOL", align: "right", format: "multiplier" },
    ],
    dataSource: PLACEHOLDER_SOURCE,
    rows: [
      { symbol: "F", price: 11.40, change: 2.1, volume: 95000000, avg_volume: 42000000, rvol: 2.3 },
      { symbol: "T", price: 22.80, change: 1.4, volume: 61000000, avg_volume: 28000000, rvol: 2.2 },
      { symbol: "INTC", price: 21.10, change: -3.8, volume: 78000000, avg_volume: 35000000, rvol: 2.2 },
      { symbol: "BAC", price: 44.20, change: 0.9, volume: 52000000, avg_volume: 24000000, rvol: 2.2 },
      { symbol: "NIO", price: 4.95, change: 7.3, volume: 88000000, avg_volume: 31000000, rvol: 2.8 },
      { symbol: "LCID", price: 2.34, change: 5.6, volume: 67000000, avg_volume: 25000000, rvol: 2.7 },
    ],
  },
];

export const getScreenerTabById = (id: string): ScreenerTab | undefined =>
  SCREENER_TABS.find((t) => t.id === id);

export const DEFAULT_SCREENER_TAB_ID = "day-trade-radar";
