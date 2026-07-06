import { defineMcp } from "@lovable.dev/mcp-js";
import searchStocks from "./tools/search-stocks";
import getStockQuote from "./tools/get-stock-quote";
import getMarketMovers from "./tools/get-market-movers";
import getMarketNews from "./tools/get-market-news";

export default defineMcp({
  name: "hedgefun-mcp",
  title: "HedgeFun Market Data",
  version: "0.1.0",
  instructions:
    "Tools for HedgeFun stock market data. Use `search_stocks` to find tickers by name or symbol, `get_stock_quote` for a single ticker's latest cached quote and fundamentals, `get_market_movers` for today's top gainers/losers/most-active/pre-market/after-hours lists, and `get_market_news` for recent market headlines. All data is cached and public; no authentication required.",
  tools: [searchStocks, getStockQuote, getMarketMovers, getMarketNews],
});
