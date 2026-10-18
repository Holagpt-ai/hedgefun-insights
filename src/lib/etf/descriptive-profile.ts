/**
 * Stable narrative profiles for flagship ETFs.
 * These describe the fund's mandate. They are not live holdings, yields, or ratios.
 */
export interface EtfDescriptiveProfile {
  name: string;
  exchange: string;
  description: string;
  strategy: string;
  benchmark: string;
  assetClass: string;
  category: string;
  region: string;
  style: string;
  provider: string;
}

export const ETF_DESCRIPTIVE_PROFILES: Record<string, EtfDescriptiveProfile> = {
  SPY: {
    name: "SPDR S&P 500 ETF Trust",
    exchange: "NYSE Arca",
    description:
      "The SPDR S&P 500 ETF Trust is the oldest and most widely traded exchange-traded fund in the United States. It seeks to provide investment results that correspond to the price and yield performance of the S&P 500 Index.",
    strategy: "Passive — full replication of the S&P 500 Index",
    benchmark: "S&P 500",
    assetClass: "Equity",
    category: "Large Cap Blend",
    region: "United States",
    style: "Blend",
    provider: "State Street Global Advisors",
  },
  QQQ: {
    name: "Invesco QQQ Trust",
    exchange: "NASDAQ",
    description:
      "The Invesco QQQ Trust tracks the Nasdaq-100 Index, which includes 100 of the largest non-financial companies listed on the Nasdaq stock exchange. It is heavily weighted toward technology and growth-oriented companies.",
    strategy: "Passive — full replication of the Nasdaq-100 Index",
    benchmark: "Nasdaq-100",
    assetClass: "Equity",
    category: "Large Cap Growth",
    region: "United States",
    style: "Growth",
    provider: "Invesco",
  },
  DIA: {
    name: "SPDR Dow Jones Industrial Average ETF",
    exchange: "NYSE Arca",
    description:
      "The SPDR Dow Jones Industrial Average ETF Trust tracks the Dow Jones Industrial Average, a price-weighted index of 30 large-cap U.S. blue-chip companies spanning all sectors except transportation and utilities.",
    strategy: "Passive — full replication of the DJIA",
    benchmark: "Dow Jones Industrial Average",
    assetClass: "Equity",
    category: "Large Cap Value",
    region: "United States",
    style: "Value",
    provider: "State Street Global Advisors",
  },
  IWM: {
    name: "iShares Russell 2000 ETF",
    exchange: "NYSE Arca",
    description:
      "The iShares Russell 2000 ETF provides exposure to small-cap U.S. equities by tracking the Russell 2000 Index. It offers broad diversification across approximately 2,000 of the smallest companies in the Russell 3000 Index.",
    strategy: "Passive — sampled replication of the Russell 2000 Index",
    benchmark: "Russell 2000",
    assetClass: "Equity",
    category: "Small Cap Blend",
    region: "United States",
    style: "Blend",
    provider: "BlackRock (iShares)",
  },
};

/** Navigation peers only. Not constituents and not a holdings source. */
export const RELATED_ETF_LINKS: Record<string, string[]> = {
  SPY: ["QQQ", "DIA", "IWM"],
  QQQ: ["SPY", "DIA", "IWM"],
  DIA: ["SPY", "QQQ", "IWM"],
  IWM: ["SPY", "QQQ", "DIA"],
};

export function descriptiveProfile(symbol: string): EtfDescriptiveProfile | null {
  return ETF_DESCRIPTIVE_PROFILES[symbol.trim().toUpperCase()] ?? null;
}
