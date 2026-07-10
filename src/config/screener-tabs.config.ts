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

export type ScreenerRow = Record<string, string | number>;

export interface ScreenerTab {
  id: string;
  label: string;
  description: string;
  criteria: string[];
  featured?: boolean;
  columns: ScreenerColumn[];
  rows: ScreenerRow[];
  freeRowLimit: number;
}

export const SCREENER_TABS: ScreenerTab[] = [
  {
    id: "day_trade_radar",
    label: "Day Trade Radar",
    description:
      "Low-float momentum names above $2 with high relative volume and strong intraday moves — a starting point for active day-trade setups.",

    criteria: ["Price $2–$20", "Float < 10M", "Up > 10%", "RVOL ≥ 5×"],
    featured: true,
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "company_name", label: "Company", format: "text", align: "left" },
      { key: "price", label: "Price", format: "price", align: "right" },
      { key: "change_percent", label: "% Change", format: "percent", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "rvol", label: "RVOL", format: "multiplier", align: "right" },
      { key: "float_shares", label: "Float", format: "shares", align: "right" },
    ],
    freeRowLimit: 2,
    rows: [
      { symbol: "NEGG", company_name: "Newegg Commerce", price: 4.85, change_percent: 38.2, volume: 42000000, rvol: 12.4, float_shares: 6800000 },
      { symbol: "ATER", company_name: "Aterian Inc", price: 2.31, change_percent: 27.6, volume: 31000000, rvol: 9.8, float_shares: 5200000 },
      { symbol: "BBIG", company_name: "Vinco Ventures", price: 3.12, change_percent: 22.1, volume: 28000000, rvol: 8.1, float_shares: 9100000 },
      { symbol: "SIDU", company_name: "Sidus Space", price: 6.74, change_percent: 19.4, volume: 18500000, rvol: 7.3, float_shares: 4400000 },
      { symbol: "MULN", company_name: "Mullen Automotive", price: 2.05, change_percent: 15.8, volume: 52000000, rvol: 6.6, float_shares: 8700000 },
      { symbol: "PHUN", company_name: "Phunware Inc", price: 8.92, change_percent: 11.3, volume: 9800000, rvol: 5.4, float_shares: 3100000 },
    ],
  },
  {
    id: "gappers",
    label: "Gappers",
    description:
      "Stocks with the largest gap between previous close and current price at the open — common starting point for momentum and reversal setups.",
    criteria: ["Gap > 5%"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "company_name", label: "Company", format: "text", align: "left" },
      { key: "price", label: "Price", format: "price", align: "right" },
      { key: "gap_percent", label: "Gap %", format: "percent", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
    ],
    freeRowLimit: 2,
    rows: [
      { symbol: "RGTI", company_name: "Rigetti Computing", price: 14.20, gap_percent: 18.5, volume: 22000000 },
      { symbol: "IONQ", company_name: "IonQ Inc", price: 28.65, gap_percent: 13.2, volume: 17500000 },
      { symbol: "SOUN", company_name: "SoundHound AI", price: 9.84, gap_percent: 11.7, volume: 31000000 },
      { symbol: "QBTS", company_name: "D-Wave Quantum", price: 6.42, gap_percent: 9.8, volume: 19200000 },
      { symbol: "LAES", company_name: "SEALSQ Corp", price: 3.18, gap_percent: 8.4, volume: 8700000 },
      { symbol: "BTAI", company_name: "BioXcel Therapeutics", price: 5.55, gap_percent: -7.2, volume: 6200000 },
    ],
  },
  {
    id: "volume_spikes",
    label: "Volume Spikes",
    description:
      "Tickers trading at multiples of their average daily volume — often signals a catalyst, news event, or unusual institutional activity.",
    criteria: ["RVOL ≥ 3×"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "company_name", label: "Company", format: "text", align: "left" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "avg_volume", label: "Avg Volume", format: "volume", align: "right" },
      { key: "rvol", label: "RVOL", format: "multiplier", align: "right" },
      { key: "change_percent", label: "% Change", format: "percent", align: "right" },
    ],
    freeRowLimit: 2,
    rows: [
      { symbol: "PLTR", company_name: "Palantir Technologies", volume: 145000000, avg_volume: 38000000, rvol: 3.8, change_percent: 6.4 },
      { symbol: "SMCI", company_name: "Super Micro Computer", volume: 62000000, avg_volume: 16000000, rvol: 3.9, change_percent: -9.1 },
      { symbol: "RIVN", company_name: "Rivian Automotive", volume: 88000000, avg_volume: 24000000, rvol: 3.7, change_percent: 4.2 },
      { symbol: "LCID", company_name: "Lucid Group", volume: 71000000, avg_volume: 19000000, rvol: 3.7, change_percent: 5.9 },
      { symbol: "AFRM", company_name: "Affirm Holdings", volume: 28000000, avg_volume: 7500000, rvol: 3.7, change_percent: 7.8 },
      { symbol: "SOFI", company_name: "SoFi Technologies", volume: 95000000, avg_volume: 22000000, rvol: 4.3, change_percent: 3.1 },
    ],
  },
  {
    id: "gainers_losers",
    label: "Gainers / Losers",
    description:
      "The day's biggest movers across the market — top gainers and decliners by percentage change.",
    criteria: [],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "company_name", label: "Company", format: "text", align: "left" },
      { key: "price", label: "Price", format: "price", align: "right" },
      { key: "change_percent", label: "% Change", format: "percent", align: "right" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "market_cap", label: "Market Cap", format: "shares", align: "right" },
    ],
    freeRowLimit: 2,
    rows: [
      { symbol: "APLD", company_name: "Applied Digital Corp", price: 12.40, change_percent: 24.6, volume: 38000000, market_cap: 3200000000 },
      { symbol: "HIMS", company_name: "Hims & Hers Health", price: 22.85, change_percent: -6.3, volume: 14500000, market_cap: 4900000000 },
      { symbol: "NVDA", company_name: "NVIDIA Corp", price: 142.30, change_percent: 2.1, volume: 210000000, market_cap: 3620000000000 },
      { symbol: "TSLA", company_name: "Tesla Inc", price: 248.60, change_percent: -3.4, volume: 98000000, market_cap: 1100000000000 },
      { symbol: "AAPL", company_name: "Apple Inc", price: 196.75, change_percent: 0.8, volume: 52000000, market_cap: 3640000000000 },
      { symbol: "AMD", company_name: "Advanced Micro Devices", price: 158.20, change_percent: 5.7, volume: 64000000, market_cap: 256000000000 },
      { symbol: "COIN", company_name: "Coinbase Global", price: 285.40, change_percent: -8.9, volume: 18000000, market_cap: 72000000000 },
      { symbol: "UPST", company_name: "Upstart Holdings", price: 68.15, change_percent: 14.2, volume: 9800000, market_cap: 5800000000 },
    ],
  },
  {
    id: "new_highs_lows",
    label: "New Highs / Lows",
    description:
      "Stocks trading at or near their 52-week high or low — useful for breakout, breakdown, and trend-continuation setups.",
    criteria: [],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "company_name", label: "Company", format: "text", align: "left" },
      { key: "price", label: "Price", format: "price", align: "right" },
      { key: "high_52w", label: "52W High", format: "price", align: "right" },
      { key: "low_52w", label: "52W Low", format: "price", align: "right" },
      { key: "change_percent", label: "% Change", format: "percent", align: "right" },
    ],
    freeRowLimit: 2,
    rows: [
      { symbol: "META", company_name: "Meta Platforms", price: 712.40, high_52w: 715.20, low_52w: 398.50, change_percent: 1.8 },
      { symbol: "NFLX", company_name: "Netflix Inc", price: 985.30, high_52w: 992.10, low_52w: 560.20, change_percent: 2.4 },
      { symbol: "GE", company_name: "GE Aerospace", price: 218.60, high_52w: 220.10, low_52w: 142.30, change_percent: 0.9 },
      { symbol: "DG", company_name: "Dollar General", price: 78.40, high_52w: 165.20, low_52w: 76.80, change_percent: -2.1 },
      { symbol: "MRNA", company_name: "Moderna Inc", price: 31.20, high_52w: 142.50, low_52w: 30.15, change_percent: -3.7 },
      { symbol: "DIS", company_name: "Walt Disney Co", price: 112.80, high_52w: 118.60, low_52w: 78.40, change_percent: 1.1 },
    ],
  },
  {
    id: "unusual_volume",
    label: "Unusual Volume",
    description:
      "Tickers showing volume significantly above their historical average — early signal of accumulation, distribution, or breaking news.",
    criteria: ["RVOL ≥ 4×"],
    columns: [
      { key: "symbol", label: "Symbol", format: "text", align: "left" },
      { key: "company_name", label: "Company", format: "text", align: "left" },
      { key: "volume", label: "Volume", format: "volume", align: "right" },
      { key: "avg_volume", label: "Avg Volume", format: "volume", align: "right" },
      { key: "rvol", label: "RVOL", format: "multiplier", align: "right" },
    ],
    freeRowLimit: 2,
    rows: [
      { symbol: "NIO", company_name: "NIO Inc", volume: 78000000, avg_volume: 16000000, rvol: 4.9 },
      { symbol: "PLUG", company_name: "Plug Power Inc", volume: 88000000, avg_volume: 19000000, rvol: 4.6 },
      { symbol: "SOFI", company_name: "SoFi Technologies", volume: 95000000, avg_volume: 22000000, rvol: 4.3 },
      { symbol: "F", company_name: "Ford Motor Co", volume: 142000000, avg_volume: 32000000, rvol: 4.4 },
      { symbol: "T", company_name: "AT&T Inc", volume: 88000000, avg_volume: 20000000, rvol: 4.4 },
      { symbol: "PFE", company_name: "Pfizer Inc", volume: 105000000, avg_volume: 24000000, rvol: 4.4 },
    ],
  },
];

export const DEFAULT_SCREENER_TAB_ID = "day_trade_radar";

export function getScreenerTabById(id: string): ScreenerTab | undefined {
  return SCREENER_TABS.find((tab) => tab.id === id);
}
