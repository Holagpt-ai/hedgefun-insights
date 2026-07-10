import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchStocks from "./tools/search-stocks";
import getStockQuote from "./tools/get-stock-quote";
import getMarketMovers from "./tools/get-market-movers";
import getMarketNews from "./tools/get-market-news";

// OAuth issuer MUST be the direct Supabase host derived from the project ref —
// never the .lovable.cloud proxy, or mcp-js rejects tokens whose discovery
// document publishes a different issuer (RFC 8414 §3.3). Vite inlines
// VITE_SUPABASE_PROJECT_ID at build time, so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hedgefun-mcp",
  title: "HedgeFun Market Data",
  version: "0.1.0",
  instructions:
    "Tools for HedgeFun stock market data. Use `search_stocks` to find tickers by name or symbol, `get_stock_quote` for a single ticker's latest cached quote and fundamentals, `get_market_movers` for today's top gainers/losers/most-active/pre-market/after-hours lists, and `get_market_news` for recent market headlines. All data is cached market data; sign in with your HedgeFun account to connect.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchStocks, getStockQuote, getMarketMovers, getMarketNews],
});
