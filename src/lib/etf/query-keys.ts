/** Query keys for ETF detail. Symbol is always included so ticker switches cannot reuse another fund's cache. */
export function etfResearchQueryKeys(symbol: string, range = "1Y") {
  const s = symbol.trim().toUpperCase();
  return {
    row: ["etf-detail", s] as const,
    chart: ["etf-chart", s, range] as const,
    snapshot: ["etf-snapshot", s] as const,
    news: ["etf-news", s] as const,
    details: ["etf-details", s] as const,
    history: ["etf-price-history", s] as const,
  };
}
