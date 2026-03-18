export interface ListFilter {
  /** Filter by market_cap range */
  marketCapMin?: number;
  marketCapMax?: number;
  /** Filter by exchange name (case-insensitive ilike) */
  exchange?: string;
  /** Filter by sector (case-insensitive ilike) */
  sector?: string;
  /** Filter by industry */
  industry?: string;
  /** Filter by max price */
  priceMax?: number;
  /** Only include these specific symbols */
  symbols?: string[];
}

export interface ListMeta {
  title: string;
  description: string;
  columns: string[];
  filter?: ListFilter;
}

const MARKET_CAP_COLS = ["symbol", "name", "price", "changePercent", "marketCap", "peRatio", "volume"];
const EXCHANGE_COLS = ["symbol", "name", "price", "changePercent", "marketCap", "volume"];
const THEME_COLS = ["symbol", "name", "price", "changePercent", "marketCap", "peRatio", "sector"];
const INTL_COLS = ["symbol", "name", "exchange", "price", "changePercent", "marketCap"];

function themeList(title: string, sector?: string, industry?: string): ListMeta {
  return {
    title,
    description: `${title} ranked by market capitalization.`,
    columns: THEME_COLS,
    filter: { ...(sector ? { sector } : {}), ...(industry ? { industry } : {}) },
  };
}

function intlExchange(name: string): ListMeta {
  return { title: `${name} Stocks`, description: `Stocks listed on the ${name}.`, columns: INTL_COLS, filter: { exchange: name } };
}

export const LIST_METADATA: Record<string, ListMeta> = {
  // Popular Lists
  "top-dividend": {
    title: "Top-Rated Dividend Stocks",
    description: "Top-rated dividend stocks according to stock analysts. Each stock has an average buy or strong buy rating from at least 10 analysts, a dividend yield of at least 2%, and a payout ratio under 60%.",
    columns: ["symbol", "name", "divYield", "divPayout", "price", "changePercent", "marketCap"],
  },
  "monthly-dividends": {
    title: "Stocks That Pay Monthly Dividends",
    description: "Stocks and funds that pay dividends on a monthly basis instead of the standard quarterly schedule.",
    columns: ["symbol", "name", "divYield", "price", "changePercent", "marketCap"],
  },
  "biggest-market-cap": {
    title: "Biggest Companies by Market Cap",
    description: "The largest publicly traded companies in the United States ranked by market capitalization.",
    columns: MARKET_CAP_COLS,
  },
  "most-employees": {
    title: "U.S. Companies With the Most Employees",
    description: "The largest U.S. employers ranked by total number of full-time employees.",
    columns: ["symbol", "name", "employees", "revenue", "marketCap"],
  },
  "most-revenue": {
    title: "U.S. Companies With the Most Revenue",
    description: "The highest-revenue U.S. public companies ranked by annual revenue.",
    columns: ["symbol", "name", "revenue", "revenueGrowth", "marketCap"],
  },
  "oldest-companies": {
    title: "100 Oldest Publicly Traded Companies",
    description: "The oldest publicly traded companies still listed on U.S. stock exchanges.",
    columns: ["symbol", "name", "founded", "sector", "marketCap"],
  },
  "highest-taxes": {
    title: "U.S. Companies That Pay the Highest Taxes",
    description: "Public companies with the highest effective tax rates based on most recent annual filings.",
    columns: ["symbol", "name", "taxRate", "revenue", "marketCap"],
  },

  // Market Cap Groups
  "mega-cap": { title: "Mega-Cap Stocks", description: "Companies with a market cap above $200 billion.", columns: MARKET_CAP_COLS, filter: { marketCapMin: 200_000_000_000 } },
  "large-cap": { title: "Large-Cap Stocks", description: "Companies with a market cap between $10 billion and $200 billion.", columns: MARKET_CAP_COLS, filter: { marketCapMin: 10_000_000_000, marketCapMax: 200_000_000_000 } },
  "mid-cap": { title: "Mid-Cap Stocks", description: "Companies with a market cap between $2 billion and $10 billion.", columns: MARKET_CAP_COLS, filter: { marketCapMin: 2_000_000_000, marketCapMax: 10_000_000_000 } },
  "small-cap": { title: "Small-Cap Stocks", description: "Companies with a market cap between $300 million and $2 billion.", columns: MARKET_CAP_COLS, filter: { marketCapMin: 300_000_000, marketCapMax: 2_000_000_000 } },
  "micro-cap": { title: "Micro-Cap Stocks", description: "Companies with a market cap between $50 million and $300 million.", columns: MARKET_CAP_COLS, filter: { marketCapMin: 50_000_000, marketCapMax: 300_000_000 } },
  "nano-cap": { title: "Nano-Cap Stocks", description: "Companies with a market cap below $50 million.", columns: MARKET_CAP_COLS, filter: { marketCapMax: 50_000_000 } },

  // U.S. Exchanges
  "nyse": { title: "Stocks Listed on NYSE", description: "All stocks listed on the New York Stock Exchange.", columns: EXCHANGE_COLS, filter: { exchange: "NYSE" } },
  "nyse-american": { title: "Stocks Listed on NYSE American", description: "All stocks listed on NYSE American (formerly AMEX).", columns: EXCHANGE_COLS, filter: { exchange: "NYSE American" } },
  "nasdaq": { title: "Stocks Listed on NASDAQ", description: "All stocks listed on the NASDAQ stock exchange.", columns: EXCHANGE_COLS, filter: { exchange: "NASDAQ" } },
  "otc": { title: "Stocks Listed on OTC Markets", description: "Stocks traded on OTC markets outside major exchanges.", columns: EXCHANGE_COLS, filter: { exchange: "OTC" } },

  // In Index (hardcoded symbol lists for well-known indexes)
  "sp-500": { title: "S&P 500 Companies", description: "All 500 companies currently in the S&P 500 index.", columns: MARKET_CAP_COLS },
  "nasdaq-100": { title: "NASDAQ 100 Companies", description: "All 100 companies in the NASDAQ 100 index.", columns: MARKET_CAP_COLS },
  "dow-jones": { title: "Dow Jones Companies", description: "The 30 companies that make up the Dow Jones Industrial Average.", columns: MARKET_CAP_COLS, filter: { symbols: ["AAPL","AMGN","AXP","BA","CAT","CRM","CSCO","CVX","DIS","DOW","GS","HD","HON","IBM","INTC","JNJ","JPM","KO","MCD","MMM","MRK","MSFT","NKE","PG","SHW","TRV","UNH","V","VZ","WMT"] } },

  // Other Lists
  "faang": { title: "FAANG Stocks", description: "Meta, Apple, Amazon, Netflix, and Alphabet — the original FAANG tech giants.", columns: ["symbol", "name", "price", "changePercent", "marketCap", "peRatio", "revenue"], filter: { symbols: ["META","AAPL","AMZN","NFLX","GOOGL"] } },
  "oversold": { title: "Oversold Stocks (RSI Below 30)", description: "Stocks with an RSI below 30, indicating potentially oversold conditions.", columns: ["symbol", "name", "rsi", "price", "changePercent", "marketCap"] },
  "overbought": { title: "Overbought Stocks (RSI Above 70)", description: "Stocks with an RSI above 70, indicating potentially overbought conditions.", columns: ["symbol", "name", "rsi", "price", "changePercent", "marketCap"] },
  "bdc": { title: "Business Development Companies", description: "Publicly traded BDCs that provide financing to small and mid-sized businesses.", columns: ["symbol", "name", "divYield", "price", "changePercent", "marketCap"], filter: { industry: "Asset Management" } },
  "optionable": { title: "Optionable Stocks", description: "Stocks that have listed options available for trading.", columns: ["symbol", "name", "price", "changePercent", "volume", "marketCap"] },
  "closed-end": { title: "Closed-End Funds", description: "Closed-end funds (CEFs) listed on U.S. exchanges.", columns: ["symbol", "name", "divYield", "price", "changePercent", "marketCap"] },
  "most-shorted": { title: "Most Shorted Stocks", description: "Stocks with the highest short interest as a percentage of float.", columns: ["symbol", "name", "shortFloat", "price", "changePercent", "marketCap"] },
  "penny-stocks": { title: "Penny Stocks (Under $5)", description: "Stocks trading below $5 per share listed on major U.S. exchanges.", columns: ["symbol", "name", "price", "changePercent", "volume", "marketCap"], filter: { priceMax: 5 } },
  "reits": { title: "All REITs", description: "Real estate investment trusts listed on U.S. stock exchanges.", columns: ["symbol", "name", "divYield", "price", "changePercent", "marketCap"], filter: { industry: "REIT" } },
  "dividend-kings": { title: "Dividend Kings", description: "Companies that have increased their dividend for 50 or more consecutive years.", columns: ["symbol", "name", "divYield", "consecutiveYears", "price", "changePercent", "marketCap"] },
  "dividend-aristocrats": { title: "Dividend Aristocrats", description: "S&P 500 companies that have increased dividends for at least 25 consecutive years.", columns: ["symbol", "name", "divYield", "consecutiveYears", "price", "changePercent", "marketCap"] },
  "magnificent-seven": { title: "The Magnificent Seven", description: "Apple, Microsoft, Nvidia, Alphabet, Amazon, Meta, and Tesla.", columns: ["symbol", "name", "price", "changePercent", "marketCap", "peRatio", "revenue"], filter: { symbols: ["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA"] } },
  "mutual-funds": { title: "Mutual Funds", description: "Mutual funds listed and tradeable on U.S. exchanges.", columns: ["symbol", "name", "price", "changePercent", "volume", "marketCap"] },

  // Stocks Ranked by Market Cap (theme/sector)
  "ai": themeList("Artificial Intelligence Stocks", "Technology"),
  "ev": themeList("Electric Vehicle Stocks", undefined, "Auto Manufacturers"),
  "banks": themeList("Bank Stocks", "Financial Services", "Banks"),
  "pharma": themeList("Pharmaceutical Stocks", "Healthcare", "Drug Manufacturers"),
  "clean-energy": themeList("Clean Energy Stocks", "Utilities"),
  "robotics": themeList("Robotics Stocks", "Industrials"),
  "gaming": themeList("Gaming Stocks", "Communication Services"),
  "social-media": themeList("Social Media Stocks", "Communication Services", "Internet Content"),
  "mobile-games": themeList("Mobile Gaming Stocks", "Communication Services"),
  "esports": themeList("E-Sports Stocks", "Communication Services"),
  "rare-earth": themeList("Rare Earth Stocks", "Basic Materials"),
  "car-companies": themeList("Car Company Stocks", undefined, "Auto Manufacturers"),
  "online-dating": themeList("Online Dating Stocks", "Communication Services"),
  "vr": themeList("Virtual Reality Stocks", "Technology"),
  "ar": themeList("Augmented Reality Stocks", "Technology"),
  "metaverse": themeList("Metaverse Stocks", "Technology"),
  "glp1": themeList("Weight Loss / GLP-1 Stocks", "Healthcare"),
  "sports-betting": themeList("Sports Betting Stocks", undefined, "Gambling"),
  "online-gambling": themeList("Online Gambling Stocks", undefined, "Gambling"),

  // Non-US Stocks
  "uk": { title: "United Kingdom Stocks on U.S. Exchanges", description: "UK-based companies listed on U.S. stock exchanges.", columns: ["symbol", "name", "exchange", "price", "changePercent", "marketCap"] },
  "canada": { title: "Canadian Stocks on U.S. Exchanges", description: "Canadian companies listed on U.S. stock exchanges.", columns: ["symbol", "name", "exchange", "price", "changePercent", "marketCap"] },
  "ireland": { title: "Irish Stocks on U.S. Exchanges", description: "Irish companies listed on U.S. stock exchanges.", columns: ["symbol", "name", "exchange", "price", "changePercent", "marketCap"] },
  "india": { title: "Indian Stocks on U.S. Exchanges", description: "Indian companies listed on U.S. stock exchanges.", columns: ["symbol", "name", "exchange", "price", "changePercent", "marketCap"] },
  "israel": { title: "Israeli Stocks on U.S. Exchanges", description: "Israeli companies listed on U.S. stock exchanges.", columns: ["symbol", "name", "exchange", "price", "changePercent", "marketCap"] },
  "china": { title: "Chinese Stocks on U.S. Exchanges", description: "Chinese companies listed on U.S. stock exchanges.", columns: ["symbol", "name", "exchange", "price", "changePercent", "marketCap"] },

  // International Exchanges
  "nasdaq-vilnius": intlExchange("Nasdaq Vilnius"),
  "dhaka": intlExchange("Dhaka Stock Exchange"),
  "spotlight": intlExchange("Spotlight Stock Market"),
  "munich": intlExchange("Munich Stock Exchange"),
  "indonesia": intlExchange("Indonesia Stock Exchange"),
  "cyprus": intlExchange("Cyprus Stock Exchange"),
  "iceland": intlExchange("Iceland Stock Exchange"),
  "xetra": intlExchange("Deutsche Börse Xetra"),
  "luxembourg": intlExchange("Luxembourg Stock Exchange"),
  "abu-dhabi": intlExchange("Abu Dhabi Securities Exchange"),
  "tanzania": intlExchange("Tanzania Stock Exchange"),
  "cse": intlExchange("Canadian Securities Exchange"),
  "ghana": intlExchange("Ghana Stock Exchange"),
  "mauritius": intlExchange("Mauritius Stock Exchange"),
  "ljubljana": intlExchange("Ljubljana Stock Exchange"),
  "johannesburg": intlExchange("Johannesburg Stock Exchange"),
  "otc-markets": intlExchange("OTC Markets"),
  "istanbul": intlExchange("Istanbul Stock Exchange"),
  "kuwait": intlExchange("Kuwait Stock Exchange"),
  "stuttgart": intlExchange("Stuttgart Stock Exchange"),
  "amman": intlExchange("Amman Stock Exchange"),
  "shanghai": intlExchange("Shanghai Stock Exchange"),
  "hcm": intlExchange("Ho Chi Minh Stock Exchange"),
};

/** Derive metadata for unknown slugs */
export function getListMeta(slug: string): ListMeta {
  if (LIST_METADATA[slug]) return LIST_METADATA[slug];
  const title = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    title,
    description: `${title} listed on U.S. stock exchanges.`,
    columns: ["symbol", "name", "price", "changePercent", "marketCap", "volume"],
  };
}
