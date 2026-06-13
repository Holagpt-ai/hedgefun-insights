// ─────────────────────────────────────────────────────────────────────────────
// HedgeFun Dashboard Screeners — Tab Registry
// ─────────────────────────────────────────────────────────────────────────────

export type ScreenerDataType = "string" | "number" | "percent" | "currency" | "shares";

export interface ColumnDef {
  key: string;
  label: string;
  dataType: ScreenerDataType;
  sortable: boolean;
  align?: "left" | "right" | "center";
}

export type FilterOperator = "gte" | "lte" | "gt" | "lt" | "eq" | "between";

export interface FilterRule {
  field: string;
  operator: FilterOperator;
  value: number | [number, number];
  label: string;
}

export interface ScreenerRow {
  symbol: string;
  company_name: string;
  price?: number;
  change_percent?: number;
  volume?: number;
  avg_volume?: number;
  rvol?: number;
  float_shares?: number;
  market_cap?: number;
  gap_percent?: number;
  high_52w?: number;
  low_52w?: number;
  day_high?: number;
  day_low?: number;
}

export interface ScreenerTabConfig {
  id: string;
  label: string;
  description: string;
  filterRules: FilterRule[];
  dataSource: {
    providers: string[];
    status: "placeholder" | "live";
  };
  columns: ColumnDef[];
  placeholderRows: ScreenerRow[];
}

const DATA_SOURCE = {
  providers: ["fiscal_ai", "sp_global"],
  status: "placeholder" as const,
};

const COL_SYMBOL: ColumnDef = { key: "symbol", label: "Symbol", dataType: "string", sortable: true, align: "left" };
const COL_NAME: ColumnDef = { key: "company_name", label: "Company", dataType: "string", sortable: true, align: "left" };
const COL_PRICE: ColumnDef = { key: "price", label: "Price", dataType: "currency", sortable: true, align: "right" };
const COL_CHANGE: ColumnDef = { key: "change_percent", label: "% Chg", dataType: "percent", sortable: true, align: "right" };
const COL_VOLUME: ColumnDef = { key: "volume", label: "Volume", dataType: "number", sortable: true, align: "right" };
const COL_AVG_VOLUME: ColumnDef = { key: "avg_volume", label: "Avg Vol", dataType: "number", sortable: true, align: "right" };
const COL_RVOL: ColumnDef = { key: "rvol", label: "RVOL", dataType: "number", sortable: true, align: "right" };
const COL_FLOAT: ColumnDef = { key: "float_shares", label: "Float", dataType: "shares", sortable: true, align: "right" };
const COL_MCAP: ColumnDef = { key: "market_cap", label: "Mkt Cap", dataType: "currency", sortable: true, align: "right" };
const COL_GAP: ColumnDef = { key: "gap_percent", label: "Gap %", dataType: "percent", sortable: true, align: "right" };
const COL_52H: ColumnDef = { key: "high_52w", label: "52W High", dataType: "currency", sortable: true, align: "right" };
const COL_52L: ColumnDef = { key: "low_52w", label: "52W Low", dataType: "currency", sortable: true, align: "right" };

export const SCREENER_TABS: ScreenerTabConfig[] = [
  {
    id: "day_trade_radar",
    label: "Day Trade Radar",
    description: "Low-float runners in motion — the momentum setup day traders scan every morning.",
    filterRules: [
      { field: "price", operator: "between", value: [2, 20], label: "Price $2–$20" },
      { field: "float_shares", operator: "lt", value: 10000000, label: "Float < 10M" },
      { field: "change_percent", operator: "gt", value: 10, label: "Up > 10%" },
      { field: "rvol", operator: "gte", value: 5, label: "RVOL ≥ 5×" },
    ],
    dataSource: DATA_SOURCE,
    columns: [COL_SYMBOL, COL_NAME, COL_PRICE, COL_CHANGE, COL_VOLUME, COL_RVOL, COL_FLOAT],
    placeholderRows: [
      { symbol: "GPUS", company_name: "Hyperscale Data Inc", price: 4.82, change_percent: 28.4, volume: 12400000, rvol: 8.1, float_shares: 6200000 },
      { symbol: "NSYS", company_name: "Nortech Systems", price: 12.34, change_percent: 19.7, volume: 4200000, rvol: 6.9, float_shares: 3100000 },
      { symbol: "VRPX", company_name: "Virpax Pharmaceuticals", price: 3.15, change_percent: 41.2, volume: 18900000, rvol: 11.3, float_shares: 8800000 },
      { symbol: "LRHC", company_name: "La Rosa Holdings", price: 8.07, change_percent: 14.6, volume: 5600000, rvol: 5.4, float_shares: 4500000 },
      { symbol: "BTAI", company_name: "BioXcel Therapeutics", price: 6.49, change_percent: 22.1, volume: 9800000, rvol: 7.2, float_shares: 9100000 },
      { symbol: "ELWS", company_name: "Earlyworks Co Ltd", price: 2.88, change_percent: 33.8, volume: 7100000, rvol: 9.6, float_shares: 2700000 },
    ],
  },
  {
    id: "gappers",
    label: "Gappers",
    description: "Stocks opening significantly above or below the prior close.",
    filterRules: [
      { field: "gap_percent", operator: "gt", value: 5, label: "Gap > 5%" },
    ],
    dataSource: DATA_SOURCE,
    columns: [COL_SYMBOL, COL_NAME, COL_PRICE, COL_GAP, COL_VOLUME],
    placeholderRows: [
      { symbol: "AVXL", company_name: "Anavex Life Sciences", price: 18.40, gap_percent: 12.3, volume: 1450000 },
      { symbol: "SOUN", company_name: "SoundHound AI", price: 9.22, gap_percent: 8.7, volume: 2100000 },
      { symbol: "RGTI", company_name: "Rigetti Computing", price: 14.05, gap_percent: 6.4, volume: 980000 },
      { symbol: "IONQ", company_name: "IonQ Inc", price: 33.10, gap_percent: 5.1, volume: 760000 },
      { symbol: "BBAI", company_name: "BigBear.ai Holdings", price: 4.67, gap_percent: 15.8, volume: 3300000 },
      { symbol: "QBTS", company_name: "D-Wave Quantum", price: 7.89, gap_percent: 9.2, volume: 1900000 },
    ],
  },
  {
    id: "volume_spikes",
    label: "Volume Spikes",
    description: "Unusual trading volume relative to the stock's daily average.",
    filterRules: [
      { field: "rvol", operator: "gte", value: 3, label: "RVOL ≥ 3×" },
    ],
    dataSource: DATA_SOURCE,
    columns: [COL_SYMBOL, COL_NAME, COL_VOLUME, COL_AVG_VOLUME, COL_RVOL, COL_CHANGE],
    placeholderRows: [
      { symbol: "PLTR", company_name: "Palantir Technologies", volume: 88000000, avg_volume: 22000000, rvol: 4.0, change_percent: 6.8 },
      { symbol: "MARA", company_name: "Marathon Digital", volume: 54000000, avg_volume: 15000000, rvol: 3.6, change_percent: -4.2 },
      { symbol: "RIOT", company_name: "Riot Platforms", volume: 41000000, avg_volume: 12000000, rvol: 3.4, change_percent: 5.1 },
      { symbol: "AFRM", company_name: "Affirm Holdings", volume: 33000000, avg_volume: 9000000, rvol: 3.7, change_percent: 9.3 },
      { symbol: "DKNG", company_name: "DraftKings Inc", volume: 28000000, avg_volume: 8500000, rvol: 3.3, change_percent: 3.2 },
      { symbol: "CVNA", company_name: "Carvana Co", volume: 19000000, avg_volume: 6000000, rvol: 3.2, change_percent: -6.7 },
    ],
  },
  {
    id: "gainers_losers",
    label: "Gainers / Losers",
    description: "The day's biggest movers in both directions.",
    filterRules: [],
    dataSource: DATA_SOURCE,
    columns: [COL_SYMBOL, COL_NAME, COL_PRICE, COL_CHANGE, COL_VOLUME, COL_MCAP],
    placeholderRows: [
      { symbol: "SMCI", company_name: "Super Micro Computer", price: 48.20, change_percent: 18.4, volume: 31000000, market_cap: 28100000000 },
      { symbol: "ARM", company_name: "Arm Holdings", price: 142.50, change_percent: 12.1, volume: 14000000, market_cap: 149000000000 },
      { symbol: "COIN", company_name: "Coinbase Global", price: 224.30, change_percent: 9.7, volume: 11000000, market_cap: 56000000000 },
      { symbol: "NVDA", company_name: "NVIDIA Corp", price: 141.20, change_percent: 4.6, volume: 220000000, market_cap: 3460000000000 },
      { symbol: "ENPH", company_name: "Enphase Energy", price: 71.40, change_percent: -14.2, volume: 9000000, market_cap: 9600000000 },
      { symbol: "SEDG", company_name: "SolarEdge Technologies", price: 22.10, change_percent: -11.8, volume: 7000000, market_cap: 1300000000 },
      { symbol: "FSLR", company_name: "First Solar Inc", price: 188.90, change_percent: -8.3, volume: 5000000, market_cap: 20000000000 },
      { symbol: "WBA", company_name: "Walgreens Boots Alliance", price: 8.90, change_percent: -7.4, volume: 22000000, market_cap: 7600000000 },
    ],
  },
  {
    id: "new_highs_lows",
    label: "New Highs / Lows",
    description: "Stocks printing fresh 52-week highs or lows today.",
    filterRules: [],
    dataSource: DATA_SOURCE,
    columns: [COL_SYMBOL, COL_NAME, COL_PRICE, COL_52H, COL_52L, COL_CHANGE],
    placeholderRows: [
      { symbol: "NVDA", company_name: "NVIDIA Corp", price: 141.20, high_52w: 141.50, low_52w: 75.60, change_percent: 2.4 },
      { symbol: "META", company_name: "Meta Platforms", price: 602.10, high_52w: 602.80, low_52w: 414.50, change_percent: 1.8 },
      { symbol: "AAPL", company_name: "Apple Inc", price: 232.40, high_52w: 234.10, low_52w: 164.10, change_percent: 0.9 },
      { symbol: "WBA", company_name: "Walgreens Boots Alliance", price: 8.90, high_52w: 27.40, low_52w: 8.80, change_percent: -3.1 },
      { symbol: "PARA", company_name: "Paramount Global", price: 10.20, high_52w: 16.30, low_52w: 10.10, change_percent: -2.6 },
      { symbol: "BMY", company_name: "Bristol-Myers Squibb", price: 49.80, high_52w: 62.10, low_52w: 49.50, change_percent: -1.4 },
    ],
  },
  {
    id: "unusual_volume",
    label: "Unusual Volume",
    description: "Volume far above the norm — early signal of institutional interest.",
    filterRules: [
      { field: "rvol", operator: "gte", value: 4, label: "RVOL ≥ 4×" },
    ],
    dataSource: DATA_SOURCE,
    columns: [COL_SYMBOL, COL_NAME, COL_VOLUME, COL_AVG_VOLUME, COL_RVOL],
    placeholderRows: [
      { symbol: "F", company_name: "Ford Motor Co", volume: 180000000, avg_volume: 42000000, rvol: 4.3 },
      { symbol: "NIO", company_name: "NIO Inc", volume: 140000000, avg_volume: 31000000, rvol: 4.5 },
      { symbol: "LCID", company_name: "Lucid Group", volume: 115000000, avg_volume: 25000000, rvol: 4.6 },
      { symbol: "INTC", company_name: "Intel Corp", volume: 160000000, avg_volume: 35000000, rvol: 4.6 },
      { symbol: "SOFI", company_name: "SoFi Technologies", volume: 95000000, avg_volume: 22000000, rvol: 4.3 },
      { symbol: "PLUG", company_name: "Plug Power Inc", volume: 88000000, avg_volume: 19000000, rvol: 4.6 },
    ],
  },
];
