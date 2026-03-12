import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Footer } from "@/components/layout/Footer";

const SECTIONS = [
  {
    title: "Main Pages",
    links: [
      ["Home", "/"], ["Watchlist", "/watchlist"], ["News", "/news"], ["Trending", "/trending"],
      ["Articles", "/articles"], ["Technical Chart", "/chart"], ["Market Newsletter", "/newsletter"],
      ["HedgeFun Pro", "/pro"], ["Tools", "/tools"], ["About", "/about"], ["Contact", "/contact"],
      ["FAQ", "/faq"], ["Advertise", "/advertise"], ["Affiliate Program", "/affiliates"],
      ["Terms of Use", "/terms"], ["Privacy Policy", "/privacy"], ["Data Disclaimer", "/disclaimer"],
      ["Support", "/support"],
    ],
  },
  {
    title: "Stocks",
    links: [
      ["All Stocks", "/stocks"], ["Stock Screener", "/screener"], ["Stock Exchanges", "/stocks/exchanges"],
      ["Comparison Tool", "/stocks/compare"], ["Earnings Calendar", "/earnings"], ["By Industry", "/stocks/industry"],
      ["Stock Lists", "/stocks/lists"], ["Top Analysts", "/stocks/analysts"], ["Top Stocks", "/stocks/top-stocks"],
      ["Corporate Actions", "/stocks/corporate-actions"],
    ],
  },
  {
    title: "IPOs",
    links: [
      ["Recent IPOs", "/ipos/recent"], ["IPO Calendar", "/ipos/calendar"], ["IPO Statistics", "/ipos/statistics"],
      ["IPO News", "/ipos/news"], ["IPO Screener", "/ipos/screener"],
    ],
  },
  {
    title: "ETFs",
    links: [
      ["ETF Screener", "/etf/screener"], ["ETF Comparison Tool", "/etf/compare"],
      ["New Launches", "/etf/list/new"], ["ETF Providers", "/etf/provider"],
    ],
  },
  {
    title: "Market Movers",
    links: [
      ["Top Gainers", "/markets/gainers"], ["Top Losers", "/markets/losers"],
      ["Most Active", "/markets/active"], ["Premarket", "/markets/premarket"],
      ["After Hours", "/markets/after-hours"], ["Market Heatmap", "/markets/heatmap"],
    ],
  },
  {
    title: "Tools",
    links: [
      ["Stock Screener", "/screener"], ["ETF Screener", "/etf/screener"],
      ["IPO Screener", "/ipos/screener"], ["Stock Comparison Tool", "/stocks/compare"],
      ["ETF Comparison Tool", "/etf/compare"], ["CAGR Calculator", "/tools"],
      ["Dividend Calculator", "/tools"], ["Symbol Lookup", "/tools"],
    ],
  },
];

const POPULAR_TICKERS = [
  "AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META","AVGO","TSLA","BRK.B",
  "BRK.A","WMT","LLY","JPM","XOM","V","JNJ","ASML","MA","ORCL",
  "HD","COST","MU","NFLX","BAC","AMD","PG","ABBV","KO","CRM",
  "CVX","MCD","PEP","TMUS","CSCO","ACN","TMO","ABT","LIN","DHR",
  "NKE","TXN","PM","GE","RTX","INTU","BKNG","QCOM","ISRG","SPGI",
];

export default function SitemapPage() {
  useEffect(() => {
    document.title = "Sitemap | HedgeFun";
  }, []);

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-8">
        Sitemap
      </h1>

      {SECTIONS.map((section, i) => (
        <div key={i} className="mb-10">
          <h2 className="text-[1.125rem] font-bold border-b border-border pb-2 mb-4">
            {section.title}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {section.links.map(([label, to], j) => (
              <Link key={j} to={to} className="text-sm text-primary hover:underline">
                {label}
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Popular Stocks */}
      <div className="mb-10">
        <h2 className="text-[1.125rem] font-bold border-b border-border pb-2 mb-4">
          Popular Stocks
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {POPULAR_TICKERS.map((t) => (
            <Link key={t} to={`/stocks/${t}`} className="text-sm text-primary hover:underline">
              {t}
            </Link>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          This sitemap shows a representative sample. HedgeFun covers 5,000+ individual stock pages, 5,000+ ETF pages, and 500+ IPO pages.
        </p>
      </div>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
