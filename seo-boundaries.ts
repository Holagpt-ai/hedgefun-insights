/** Shared SEO path rules for Vite app + Vercel middleware (no path aliases). */

export const CANONICAL_SITE_ORIGIN = "https://stocksist.com";

export const NOINDEX_PATH_PREFIXES = [
  "/dashboard",
  "/admin",
  "/account",
  "/auth",
  "/login",
  "/signup",
  "/register",
  "/sign-up",
  "/reset-password",
  "/unsubscribe",
  "/journal",
  "/.lovable",
] as const;

export function isNoindexPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return NOINDEX_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** First segment under /stocks/ that are app routes, not ticker symbols. */
export const STOCK_RESERVED_SEGMENTS = new Set([
  "compare",
  "lists",
  "analysts",
  "exchanges",
  "industry",
  "top-stocks",
  "corporate-actions",
]);

export const ETF_LEGACY_RESERVED_SEGMENTS = new Set([
  "screener",
  "compare",
  "list",
  "provider",
]);

export const ETFS_RESERVED_SEGMENTS = new Set([
  "screener",
  "compare",
  "top",
]);

const IPO_STATIC_PATHS = new Set([
  "/ipos",
  "/ipos/recent",
  "/ipos/calendar",
  "/ipos/statistics",
  "/ipos/news",
]);

/** US ticker-like symbol (detail pages only). */
export function isLikelyTickerSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s || s.length > 12) return false;
  return /^[A-Za-z][A-Za-z0-9.-]*$/.test(s);
}

export function stockDetailSymbolFromPath(pathname: string): string | null {
  const path = pathname.split("?")[0] ?? pathname;
  if (!path.startsWith("/stocks/")) return null;
  const rest = path.slice("/stocks/".length);
  const segment = rest.split("/")[0];
  if (!segment) return null;
  if (STOCK_RESERVED_SEGMENTS.has(segment.toLowerCase())) return null;
  if (!isLikelyTickerSegment(segment)) return null;
  if (rest.includes("/")) return null;
  return segment.toUpperCase();
}

export function etfDetailSymbolFromPath(pathname: string): string | null {
  const path = pathname.split("?")[0] ?? pathname;
  if (path.startsWith("/etfs/")) {
    const segment = path.slice("/etfs/".length).split("/")[0];
    if (!segment || ETFS_RESERVED_SEGMENTS.has(segment.toLowerCase())) return null;
    if (!isLikelyTickerSegment(segment)) return null;
    if (path.slice("/etfs/".length).includes("/")) return null;
    return segment.toUpperCase();
  }
  if (path.startsWith("/etf/")) {
    const segment = path.slice("/etf/".length).split("/")[0];
    if (!segment || ETF_LEGACY_RESERVED_SEGMENTS.has(segment.toLowerCase())) {
      return null;
    }
    if (!isLikelyTickerSegment(segment)) return null;
    if (path.slice("/etf/".length).includes("/")) return null;
    return segment.toUpperCase();
  }
  return null;
}

export function isKnownIpoListingPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return IPO_STATIC_PATHS.has(path);
}

export const MIDDLEWARE_PUBLIC_META: Record<
  string,
  { title: string; description: string }
> = {
  "/stocks": {
    title: "All Stocks — Browse US Equities | Stocksist",
    description: "Browse US-listed stocks with quotes, news, and research on Stocksist.",
  },
  "/screener": {
    title: "Stock Screener — Filter & Find Stocks | Stocksist",
    description:
      "Screen and filter thousands of stocks by price, volume, market cap, sector, and more on Stocksist.",
  },
  "/earnings": {
    title: "Earnings Calendar — Upcoming & Recent Reports | Stocksist",
    description:
      "Track upcoming and recent earnings reports, EPS estimates, and actual results for US stocks on Stocksist.",
  },
  "/ipos": {
    title: "IPO Calendar 2026 — Upcoming & Recent IPOs | Stocksist",
    description:
      "Track upcoming and recent IPOs, expected offer prices, listing dates, and post-IPO performance on Stocksist.",
  },
  "/ipos/recent": {
    title: "Recent IPOs — Latest Listings | Stocksist",
    description: "Browse recently listed IPOs with offer details and early trading context on Stocksist.",
  },
  "/ipos/calendar": {
    title: "IPO Calendar — Upcoming Listings | Stocksist",
    description: "See scheduled and expected IPO listings on Stocksist.",
  },
  "/ipos/statistics": {
    title: "IPO Statistics | Stocksist",
    description: "IPO market statistics and trends on Stocksist.",
  },
  "/ipos/news": {
    title: "IPO News | Stocksist",
    description: "Latest IPO news and listing coverage on Stocksist.",
  },
  "/news": {
    title: "Stock Market News & Financial Analysis | Stocksist",
    description:
      "Get the latest stock market news, earnings coverage, economic updates, and financial analysis on Stocksist.",
  },
  "/trending": {
    title: "Trending Stocks — Market Movers | Stocksist",
    description: "Follow trending tickers, volume leaders, and active market themes on Stocksist.",
  },
  "/articles": {
    title: "Market Articles & Education | Stocksist",
    description: "Read market articles, guides, and educational content on Stocksist.",
  },
  "/tools": {
    title: "Investing Tools & Calculators | Stocksist",
    description: "Free investing tools and calculators for portfolio and trade planning on Stocksist.",
  },
  "/markets/gainers": {
    title: "Top Stock Gainers Today | Stocksist",
    description: "See today's top gaining US stocks by price change on Stocksist.",
  },
  "/markets/losers": {
    title: "Top Stock Losers Today | Stocksist",
    description: "See today's biggest declining US stocks by price change on Stocksist.",
  },
  "/markets/active": {
    title: "Most Active Stocks by Volume | Stocksist",
    description: "Track the most actively traded stocks by volume on Stocksist.",
  },
  "/markets/premarket": {
    title: "Pre-Market Movers | Stocksist",
    description: "Pre-market stock movers and extended-hours activity on Stocksist.",
  },
  "/markets/after-hours": {
    title: "After-Hours Movers | Stocksist",
    description: "After-hours stock movers and extended-hours activity on Stocksist.",
  },
  "/markets/heatmap": {
    title: "Market Heatmap — Sector Performance | Stocksist",
    description: "Visualize sector and industry performance with the Stocksist market heatmap.",
  },
  "/about": {
    title: "About Stocksist",
    description: "Learn about Stocksist — market data, screeners, and research tools for investors.",
  },
  "/methodology": {
    title: "Data Methodology | Stocksist",
    description: "How Stocksist sources, labels, and presents market data and screeners.",
  },
};
