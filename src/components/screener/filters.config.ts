// ─────────────────────────────────────────────────────────────────────────────
// HedgeFun Stock Screener — Filter Registry
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO ADD A NEW FILTER:
//   1. Add a new FilterDef object to the FILTERS array below.
//   2. Set dbColumn to the exact Supabase column name (or null if not yet available).
//   3. Set tier: "free" | "pro" | "coming_soon"
//   4. Set type: "range" | "select" | "boolean" | "date"
//   5. That's it. The modal, chips, and query builder all update automatically.
//
// HOW TO UPGRADE A FILTER (e.g. Fiscal.ai goes live):
//   - Change dbColumn from null to the real column name.
//   - Change tier from "coming_soon" to "free" or "pro".
//   - Done. No other files need to change.
// ─────────────────────────────────────────────────────────────────────────────

export type FilterTier = "free" | "pro" | "coming_soon";
export type FilterType = "range" | "select" | "boolean" | "date";
export type FilterGroup =
  | "Most Popular"
  | "Price & Volume"
  | "Valuation & Ratios"
  | "Technical Analysis"
  | "Company Info"
  | "Earnings"
  | "Dividends & Buybacks"
  | "Financials"
  | "Performance"
  | "Short Selling"
  | "Options Flow";

export type FilterDef = {
  id: string;
  label: string;
  group: FilterGroup;
  type: FilterType;
  tier: FilterTier;
  dbColumn: string | null;
  dbTable: "stocks" | "ticker_search" | null;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  description?: string;
};

export type ActiveFilter = {
  id: string;
  min?: number | string;
  max?: number | string;
  value?: string | boolean;
};

export const SECTOR_OPTIONS = [
  { label: "Technology", value: "Technology" },
  { label: "Healthcare", value: "Healthcare" },
  { label: "Financials", value: "Financials" },
  { label: "Consumer Discretionary", value: "Consumer Discretionary" },
  { label: "Consumer Staples", value: "Consumer Staples" },
  { label: "Energy", value: "Energy" },
  { label: "Industrials", value: "Industrials" },
  { label: "Materials", value: "Materials" },
  { label: "Real Estate", value: "Real Estate" },
  { label: "Utilities", value: "Utilities" },
  { label: "Communication Services", value: "Communication Services" },
];

export const EXCHANGE_OPTIONS = [
  { label: "NYSE", value: "NYSE" },
  { label: "NASDAQ", value: "XNAS" },
  { label: "AMEX", value: "AMEX" },
  { label: "OTC", value: "OTC" },
  { label: "TSX", value: "TSX" },
  { label: "LSE", value: "XLON" },
];

export const MARKET_CAP_GROUP_OPTIONS = [
  { label: "Mega Cap (>$200B)", value: "mega" },
  { label: "Large Cap ($10B–$200B)", value: "large" },
  { label: "Mid Cap ($2B–$10B)", value: "mid" },
  { label: "Small Cap ($300M–$2B)", value: "small" },
  { label: "Micro Cap ($50M–$300M)", value: "micro" },
  { label: "Nano Cap (<$50M)", value: "nano" },
];

export const FILTERS: FilterDef[] = [
  { id: "market_cap", label: "Market Cap", group: "Most Popular", type: "range", tier: "free", dbColumn: "market_cap", dbTable: "stocks", min: 0, max: 3000, step: 1, suffix: "B", description: "Total market capitalization in billions USD" },
  { id: "price", label: "Stock Price", group: "Most Popular", type: "range", tier: "free", dbColumn: "price", dbTable: "stocks", min: 0, max: 10000, step: 0.01, prefix: "$", description: "Current stock price" },
  { id: "change_percent", label: "% Change (1D)", group: "Most Popular", type: "range", tier: "free", dbColumn: "change_percent", dbTable: "stocks", min: -100, max: 100, step: 0.1, suffix: "%", description: "1-day price change percentage" },
  { id: "volume", label: "Volume", group: "Most Popular", type: "range", tier: "free", dbColumn: "volume", dbTable: "stocks", min: 0, max: 1000000000, step: 100000, description: "Daily trading volume" },
  { id: "pe_ratio", label: "PE Ratio", group: "Most Popular", type: "range", tier: "free", dbColumn: "pe_ratio", dbTable: "stocks", min: 0, max: 1000, step: 0.1, description: "Price-to-earnings ratio" },
  { id: "sector", label: "Sector", group: "Most Popular", type: "select", tier: "free", dbColumn: "sector", dbTable: "stocks", options: SECTOR_OPTIONS, description: "GICS sector classification" },
  { id: "dividend_yield", label: "Dividend Yield", group: "Most Popular", type: "range", tier: "free", dbColumn: "dividend_yield", dbTable: "stocks", min: 0, max: 30, step: 0.1, suffix: "%", description: "Annual dividend yield" },
  { id: "analyst_rating", label: "Analyst Rating", group: "Most Popular", type: "select", tier: "pro", dbColumn: null, dbTable: null, options: [{ label: "Strong Buy", value: "strong_buy" }, { label: "Buy", value: "buy" }, { label: "Hold", value: "hold" }, { label: "Sell", value: "sell" }, { label: "Strong Sell", value: "strong_sell" }], description: "Consensus analyst rating" },
  { id: "price_pv", label: "Stock Price", group: "Price & Volume", type: "range", tier: "free", dbColumn: "price", dbTable: "stocks", min: 0, max: 10000, step: 0.01, prefix: "$" },
  { id: "change_percent_pv", label: "Price Change 1D", group: "Price & Volume", type: "range", tier: "free", dbColumn: "change_percent", dbTable: "stocks", min: -100, max: 100, step: 0.1, suffix: "%" },
  { id: "volume_pv", label: "Volume", group: "Price & Volume", type: "range", tier: "free", dbColumn: "volume", dbTable: "stocks", min: 0, max: 1000000000, step: 100000 },
  { id: "avg_volume", label: "Average Volume", group: "Price & Volume", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 1000000000, step: 100000, description: "30-day average daily volume" },
  { id: "week_52_high", label: "52-Week High", group: "Price & Volume", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 10000, step: 0.01, prefix: "$" },
  { id: "week_52_low", label: "52-Week Low", group: "Price & Volume", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 10000, step: 0.01, prefix: "$" },
  { id: "beta", label: "Beta", group: "Price & Volume", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -5, max: 10, step: 0.1, description: "Volatility relative to market" },
  { id: "relative_volume", label: "Relative Volume", group: "Price & Volume", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 20, step: 0.1, description: "Current vs average volume ratio" },
  { id: "pe_ratio_val", label: "PE Ratio", group: "Valuation & Ratios", type: "range", tier: "free", dbColumn: "pe_ratio", dbTable: "stocks", min: 0, max: 1000, step: 0.1 },
  { id: "market_cap_val", label: "Market Cap", group: "Valuation & Ratios", type: "range", tier: "free", dbColumn: "market_cap", dbTable: "stocks", min: 0, max: 3000, step: 1, suffix: "B" },
  { id: "market_cap_group", label: "Market Cap Group", group: "Valuation & Ratios", type: "select", tier: "free", dbColumn: "market_cap", dbTable: "stocks", options: MARKET_CAP_GROUP_OPTIONS, description: "Filter by market cap classification" },
  { id: "forward_pe", label: "Forward PE", group: "Valuation & Ratios", type: "range", tier: "pro", dbColumn: null, dbTable: null, min: 0, max: 500, step: 0.1, description: "Forward price-to-earnings ratio" },
  { id: "ps_ratio", label: "PS Ratio", group: "Valuation & Ratios", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 100, step: 0.1, description: "Price-to-sales ratio" },
  { id: "pb_ratio", label: "PB Ratio", group: "Valuation & Ratios", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 100, step: 0.1, description: "Price-to-book ratio" },
  { id: "ev_ebitda", label: "EV/EBITDA", group: "Valuation & Ratios", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 200, step: 0.1 },
  { id: "peg_ratio", label: "PEG Ratio", group: "Valuation & Ratios", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 20, step: 0.1, description: "PE ratio divided by earnings growth rate" },
  { id: "ev_sales", label: "EV/Sales", group: "Valuation & Ratios", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 100, step: 0.1 },
  { id: "ev_fcf", label: "EV/FCF", group: "Valuation & Ratios", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 200, step: 0.1 },
  { id: "earnings_yield", label: "Earnings Yield", group: "Valuation & Ratios", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 50, step: 0.1, suffix: "%" },
  { id: "rsi", label: "RSI (14)", group: "Technical Analysis", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 100, step: 1, description: "14-day Relative Strength Index" },
  { id: "ma_50", label: "50-Day MA", group: "Technical Analysis", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 10000, step: 0.01, prefix: "$" },
  { id: "ma_200", label: "200-Day MA", group: "Technical Analysis", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 10000, step: 0.01, prefix: "$" },
  { id: "price_vs_ma50", label: "Price vs 50-Day MA", group: "Technical Analysis", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 500, step: 0.1, suffix: "%" },
  { id: "price_vs_ma200", label: "Price vs 200-Day MA", group: "Technical Analysis", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 500, step: 0.1, suffix: "%" },
  { id: "atr", label: "ATR (14)", group: "Technical Analysis", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 1000, step: 0.01, prefix: "$", description: "14-day Average True Range" },
  { id: "sector_ci", label: "Sector", group: "Company Info", type: "select", tier: "free", dbColumn: "sector", dbTable: "stocks", options: SECTOR_OPTIONS },
  { id: "industry", label: "Industry", group: "Company Info", type: "select", tier: "free", dbColumn: "industry", dbTable: "stocks", options: [], description: "Specific industry within a sector" },
  { id: "exchange", label: "Exchange", group: "Company Info", type: "select", tier: "free", dbColumn: "exchange", dbTable: "stocks", options: EXCHANGE_OPTIONS },
  { id: "country", label: "Country", group: "Company Info", type: "select", tier: "coming_soon", dbColumn: null, dbTable: null, options: [], description: "Country of incorporation" },
  { id: "ipo_date", label: "IPO Date", group: "Company Info", type: "date", tier: "coming_soon", dbColumn: null, dbTable: null },
  { id: "employees", label: "Employees", group: "Company Info", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 2000000, step: 1000 },
  { id: "is_spac", label: "Is SPAC", group: "Company Info", type: "boolean", tier: "coming_soon", dbColumn: null, dbTable: null },
  { id: "next_earnings_date", label: "Next Earnings Date", group: "Earnings", type: "date", tier: "coming_soon", dbColumn: null, dbTable: null },
  { id: "eps_estimate", label: "EPS Estimate", group: "Earnings", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 1000, step: 0.01, prefix: "$" },
  { id: "eps_growth", label: "EPS Growth", group: "Earnings", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 1000, step: 0.1, suffix: "%" },
  { id: "revenue_estimate", label: "Revenue Estimate", group: "Earnings", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 1000, step: 0.1, suffix: "B" },
  { id: "revenue_growth", label: "Revenue Growth", group: "Earnings", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 1000, step: 0.1, suffix: "%" },
  { id: "dividend_yield_div", label: "Dividend Yield", group: "Dividends & Buybacks", type: "range", tier: "free", dbColumn: "dividend_yield", dbTable: "stocks", min: 0, max: 30, step: 0.1, suffix: "%" },
  { id: "dividend_growth", label: "Dividend Growth", group: "Dividends & Buybacks", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -50, max: 200, step: 0.1, suffix: "%" },
  { id: "payout_ratio", label: "Payout Ratio", group: "Dividends & Buybacks", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 200, step: 0.1, suffix: "%" },
  { id: "ex_dividend_date", label: "Ex-Dividend Date", group: "Dividends & Buybacks", type: "date", tier: "coming_soon", dbColumn: null, dbTable: null },
  { id: "buyback_yield", label: "Buyback Yield", group: "Dividends & Buybacks", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -20, max: 20, step: 0.1, suffix: "%" },
  { id: "shareholder_yield", label: "Shareholder Yield", group: "Dividends & Buybacks", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -30, max: 50, step: 0.1, suffix: "%" },
  { id: "revenue", label: "Revenue", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 1000, step: 0.1, suffix: "B" },
  { id: "net_income", label: "Net Income", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -500, max: 500, step: 0.1, suffix: "B" },
  { id: "gross_margin", label: "Gross Margin", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 100, step: 0.1, suffix: "%" },
  { id: "operating_margin", label: "Operating Margin", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 100, step: 0.1, suffix: "%" },
  { id: "profit_margin", label: "Profit Margin", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 100, step: 0.1, suffix: "%" },
  { id: "free_cash_flow", label: "Free Cash Flow", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -500, max: 500, step: 0.1, suffix: "B" },
  { id: "total_debt", label: "Total Debt", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 1000, step: 0.1, suffix: "B" },
  { id: "debt_equity", label: "Debt / Equity", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: 0, max: 20, step: 0.01 },
  { id: "return_on_equity", label: "Return on Equity", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 200, step: 0.1, suffix: "%" },
  { id: "return_on_assets", label: "Return on Assets", group: "Financials", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -50, max: 100, step: 0.1, suffix: "%" },
  { id: "change_1w", label: "Price Change 1W", group: "Performance", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 500, step: 0.1, suffix: "%" },
  { id: "change_1m", label: "Price Change 1M", group: "Performance", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 500, step: 0.1, suffix: "%" },
  { id: "change_3m", label: "Price Change 3M", group: "Performance", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 1000, step: 0.1, suffix: "%" },
  { id: "change_ytd", label: "Price Change YTD", group: "Performance", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 1000, step: 0.1, suffix: "%" },
  { id: "change_1y", label: "Price Change 1Y", group: "Performance", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 1000, step: 0.1, suffix: "%" },
  { id: "change_3y", label: "Price Change 3Y", group: "Performance", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 2000, step: 0.1, suffix: "%" },
  { id: "change_5y", label: "Price Change 5Y", group: "Performance", type: "range", tier: "coming_soon", dbColumn: null, dbTable: null, min: -100, max: 5000, step: 0.1, suffix: "%" },
  { id: "short_float", label: "Short % Float", group: "Short Selling", type: "range", tier: "pro", dbColumn: null, dbTable: null, min: 0, max: 100, step: 0.1, suffix: "%", description: "Short interest as % of float" },
  { id: "short_shares", label: "Short % Shares", group: "Short Selling", type: "range", tier: "pro", dbColumn: null, dbTable: null, min: 0, max: 100, step: 0.1, suffix: "%" },
  { id: "short_ratio", label: "Short Ratio", group: "Short Selling", type: "range", tier: "pro", dbColumn: null, dbTable: null, min: 0, max: 50, step: 0.1, description: "Days to cover" },
  { id: "put_call_ratio", label: "Put/Call Ratio", group: "Options Flow", type: "range", tier: "pro", dbColumn: null, dbTable: null, min: 0, max: 10, step: 0.01 },
  { id: "unusual_options", label: "Unusual Options Activity", group: "Options Flow", type: "boolean", tier: "pro", dbColumn: null, dbTable: null },
  { id: "implied_volatility", label: "Implied Volatility", group: "Options Flow", type: "range", tier: "pro", dbColumn: null, dbTable: null, min: 0, max: 500, step: 0.1, suffix: "%" },
];

export const FILTER_GROUPS: FilterGroup[] = [
  "Most Popular",
  "Price & Volume",
  "Valuation & Ratios",
  "Technical Analysis",
  "Company Info",
  "Earnings",
  "Dividends & Buybacks",
  "Financials",
  "Performance",
  "Short Selling",
  "Options Flow",
];

export const getFiltersByGroup = (group: FilterGroup): FilterDef[] =>
  FILTERS.filter((f) => f.group === group);

export const getFilterById = (id: string): FilterDef | undefined =>
  FILTERS.find((f) => f.id === id);

export const DEFAULT_INLINE_FILTERS: string[] = [
  "market_cap",
  "price",
  "change_percent",
  "volume",
  "pe_ratio",
  "sector",
  "dividend_yield",
];
