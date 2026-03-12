import { useState, useMemo, useCallback, useEffect } from "react";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { AdBanner } from "@/components/layout/AdBanner";
import { Footer } from "@/components/layout/Footer";
import { Lock, ChevronDown } from "lucide-react";

const TIMEFRAMES = ["1D", "1W", "1M", "YTD", "1Y"] as const;

interface StockTile {
  ticker: string;
  name: string;
  change: number;
  mcap: number; // relative weight
  price: number;
}

interface Industry {
  name: string;
  stocks: StockTile[];
}

interface Sector {
  name: string;
  industries: Industry[];
}

const SECTORS: Sector[] = [
  {
    name: "Technology",
    industries: [
      {
        name: "Semiconductors",
        stocks: [
          { ticker: "NVDA", name: "NVIDIA Corp", change: 0.69, mcap: 28, price: 878.37 },
          { ticker: "AVGO", name: "Broadcom Inc", change: -0.29, mcap: 14, price: 168.52 },
          { ticker: "AMD", name: "Advanced Micro Devices", change: 0.79, mcap: 8, price: 101.23 },
          { ticker: "MU", name: "Micron Technology", change: 3.86, mcap: 5, price: 95.81 },
          { ticker: "INTC", name: "Intel Corp", change: -1.74, mcap: 4, price: 23.41 },
          { ticker: "TXN", name: "Texas Instruments", change: 0.31, mcap: 4, price: 185.20 },
          { ticker: "AMAT", name: "Applied Materials", change: -0.52, mcap: 3, price: 156.78 },
          { ticker: "KLAC", name: "KLA Corp", change: 0.18, mcap: 2, price: 642.50 },
          { ticker: "MRVL", name: "Marvell Technology", change: -0.93, mcap: 2, price: 62.15 },
        ],
      },
      {
        name: "Software - Infrastructure",
        stocks: [
          { ticker: "MSFT", name: "Microsoft Corp", change: -0.22, mcap: 26, price: 388.47 },
          { ticker: "ORCL", name: "Oracle Corp", change: 9.18, mcap: 10, price: 163.82 },
          { ticker: "PLTR", name: "Palantir Technologies", change: 0.37, mcap: 4, price: 82.15 },
          { ticker: "CRM", name: "Salesforce Inc", change: -0.4, mcap: 6, price: 267.90 },
          { ticker: "PANW", name: "Palo Alto Networks", change: -0.61, mcap: 3, price: 175.42 },
        ],
      },
      {
        name: "Consumer Electronics",
        stocks: [
          { ticker: "AAPL", name: "Apple Inc", change: -0.01, mcap: 30, price: 227.48 },
        ],
      },
    ],
  },
  {
    name: "Financials",
    industries: [
      {
        name: "Banks - Diversified",
        stocks: [
          { ticker: "JPM", name: "JPMorgan Chase", change: -0.42, mcap: 10, price: 236.15 },
          { ticker: "BAC", name: "Bank of America", change: -0.08, mcap: 6, price: 41.82 },
        ],
      },
      {
        name: "Insurance - Diversified",
        stocks: [
          { ticker: "BRK.B", name: "Berkshire Hathaway", change: -0.12, mcap: 12, price: 518.30 },
        ],
      },
      {
        name: "Capital Markets",
        stocks: [
          { ticker: "WFC", name: "Wells Fargo", change: -2.01, mcap: 4, price: 67.25 },
        ],
      },
      {
        name: "Credit Services",
        stocks: [
          { ticker: "MA", name: "Mastercard Inc", change: -2.08, mcap: 7, price: 532.18 },
          { ticker: "V", name: "Visa Inc", change: -1.74, mcap: 8, price: 312.45 },
          { ticker: "AXP", name: "American Express", change: -0.54, mcap: 3, price: 268.90 },
        ],
      },
    ],
  },
  {
    name: "Consumer Discretionary",
    industries: [
      {
        name: "Auto Manufacturers",
        stocks: [
          { ticker: "TSLA", name: "Tesla Inc", change: 2.15, mcap: 14, price: 251.72 },
        ],
      },
      {
        name: "Internet Retail",
        stocks: [
          { ticker: "AMZN", name: "Amazon.com Inc", change: -0.78, mcap: 16, price: 197.83 },
        ],
      },
    ],
  },
  {
    name: "Industrials",
    industries: [
      {
        name: "Aerospace & Defense",
        stocks: [
          { ticker: "GE", name: "GE Aerospace", change: -0.42, mcap: 5, price: 189.25 },
          { ticker: "RTX", name: "RTX Corp", change: 0.28, mcap: 4, price: 128.60 },
          { ticker: "HON", name: "Honeywell Intl", change: -0.35, mcap: 4, price: 202.15 },
          { ticker: "LMT", name: "Lockheed Martin", change: 0.15, mcap: 3, price: 468.30 },
          { ticker: "UNP", name: "Union Pacific", change: -0.61, mcap: 3, price: 235.80 },
          { ticker: "UPS", name: "United Parcel Service", change: -1.12, mcap: 2, price: 128.45 },
        ],
      },
    ],
  },
  {
    name: "Communication Services",
    industries: [
      {
        name: "Internet Content & Information",
        stocks: [
          { ticker: "GOOGL", name: "Alphabet Inc", change: 0.54, mcap: 18, price: 167.42 },
          { ticker: "META", name: "Meta Platforms", change: 0.12, mcap: 14, price: 585.30 },
        ],
      },
      {
        name: "Entertainment",
        stocks: [
          { ticker: "NFLX", name: "Netflix Inc", change: -2.11, mcap: 5, price: 892.15 },
        ],
      },
    ],
  },
  {
    name: "Healthcare",
    industries: [
      {
        name: "Drug Manufacturers - General",
        stocks: [
          { ticker: "LLY", name: "Eli Lilly", change: -0.15, mcap: 12, price: 782.40 },
          { ticker: "JNJ", name: "Johnson & Johnson", change: -0.3, mcap: 8, price: 155.82 },
          { ticker: "ABBV", name: "AbbVie Inc", change: 0.3, mcap: 6, price: 192.65 },
          { ticker: "MRK", name: "Merck & Co", change: -0.75, mcap: 5, price: 86.30 },
        ],
      },
    ],
  },
  {
    name: "Consumer Staples",
    industries: [
      {
        name: "Discount Stores",
        stocks: [
          { ticker: "WMT", name: "Walmart Inc", change: -1.3, mcap: 8, price: 85.42 },
          { ticker: "COST", name: "Costco Wholesale", change: -0.51, mcap: 6, price: 892.30 },
        ],
      },
    ],
  },
  {
    name: "Energy",
    industries: [
      {
        name: "Oil & Gas Integrated",
        stocks: [
          { ticker: "XOM", name: "Exxon Mobil", change: 2.33, mcap: 8, price: 108.92 },
        ],
      },
    ],
  },
  {
    name: "Utilities",
    industries: [
      {
        name: "Regulated Electric",
        stocks: [
          { ticker: "NEE", name: "NextEra Energy", change: -0.82, mcap: 3, price: 72.45 },
        ],
      },
    ],
  },
  {
    name: "Real Estate",
    industries: [
      {
        name: "REIT - Diversified",
        stocks: [
          { ticker: "PLD", name: "Prologis Inc", change: -0.45, mcap: 2, price: 112.30 },
        ],
      },
    ],
  },
  {
    name: "Materials",
    industries: [
      {
        name: "Specialty Chemicals",
        stocks: [
          { ticker: "LIN", name: "Linde PLC", change: 0.22, mcap: 3, price: 452.80 },
        ],
      },
    ],
  },
];

function getColor(change: number): string {
  if (change > 2) return "#1a7a3c";
  if (change > 1) return "#2d9e52";
  if (change > 0) return "#4caf70";
  if (change === 0) return "#666";
  if (change > -1) return "#c0392b";
  if (change > -2) return "#a93226";
  return "#8b0000";
}

// Flatten all stocks with sector info for layout
function getAllTiles() {
  const tiles: { sector: string; industry: string; stock: StockTile }[] = [];
  for (const sector of SECTORS) {
    for (const industry of sector.industries) {
      for (const stock of industry.stocks) {
        tiles.push({ sector: sector.name, industry: industry.name, stock });
      }
    }
  }
  return tiles;
}

function HeatmapPage() {
  const [timeframe, setTimeframe] = useState<string>("1D");
  const [tfOpen, setTfOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [hoveredStock, setHoveredStock] = useState<{ stock: StockTile; x: number; y: number } | null>(null);

  const totalMcap = useMemo(() => {
    return SECTORS.reduce((sum, s) => s.industries.reduce((s2, i) => s2 + i.stocks.reduce((s3, st) => s3 + st.mcap, 0), sum), 0);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent, stock: StockTile) => {
    setHoveredStock({ stock, x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredStock(null);
  }, []);

  return (
    <>
      <Helmet>
        <title>Market Heatmap | HedgeFun</title>
        <meta name="description" content="S&P 500 stock performance heatmap by sector and industry. Size represents market cap, color represents relative performance." />
      </Helmet>

      <div className="w-full max-w-7xl mx-auto px-4">
        <MarketMoversTabBar />

        {/* Header */}
        <div className="flex items-center justify-between py-4">
          <h1 className="text-[1.5rem] font-bold" style={{ color: "hsl(var(--text-primary))" }}>
            S&P 500 · {timeframe} Performance
          </h1>
          <div className="flex items-center gap-2">
            {/* Timeframe dropdown */}
            <div className="relative">
              <button
                onClick={() => { setTfOpen(!tfOpen); setDlOpen(false); }}
                className="flex items-center gap-1 text-[0.875rem] px-3 py-1.5 rounded border border-border"
                style={{ color: "hsl(var(--text-primary))" }}
              >
                {timeframe} <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {tfOpen && (
                <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded shadow-sm z-20 min-w-[80px]">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => { setTimeframe(tf); setTfOpen(false); }}
                      className="block w-full text-left px-3 py-1.5 text-[0.875rem] hover:bg-muted transition-colors"
                      style={{ color: "hsl(var(--text-primary))", fontWeight: tf === timeframe ? 700 : 400 }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Download dropdown */}
            <div className="relative">
              <button
                onClick={() => { setDlOpen(!dlOpen); setTfOpen(false); }}
                className="flex items-center gap-1 text-[0.875rem] px-3 py-1.5 rounded border border-border"
                style={{ color: "hsl(var(--text-primary))" }}
              >
                Download <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {dlOpen && (
                <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded shadow-sm z-20 min-w-[100px]">
                  {["CSV", "Excel", "JSON"].map((f) => (
                    <button key={f} className="block w-full text-left px-3 py-1.5 text-[0.875rem] hover:bg-muted transition-colors" style={{ color: "hsl(var(--text-primary))" }}>
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="flex items-center gap-1.5 text-[0.875rem] px-3 py-1.5 rounded border border-border" style={{ color: "hsl(var(--text-muted))" }}>
              Full Width <Lock className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Treemap */}
        <div className="rounded overflow-hidden" style={{ minHeight: 500, background: "#1a1a2e" }}>
          {/* Sector header + CSS grid treemap */}
          <div className="w-full h-full" style={{ minHeight: 500 }}>
            {SECTORS.map((sector) => {
              const sectorMcap = sector.industries.reduce((s, i) => s + i.stocks.reduce((s2, st) => s2 + st.mcap, 0), 0);
              const sectorPct = (sectorMcap / totalMcap) * 100;
              if (sectorPct < 1) return null;

              return (
                <div key={sector.name} className="mb-px">
                  {/* Sector label */}
                  <div className="px-2 py-0.5" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <span className="text-[0.8125rem] font-semibold text-white uppercase tracking-wide">{sector.name}</span>
                  </div>
                  {/* Industries */}
                  <div className="flex flex-wrap">
                    {sector.industries.map((industry) => {
                      const indMcap = industry.stocks.reduce((s, st) => s + st.mcap, 0);
                      const indPct = (indMcap / sectorMcap) * 100;

                      return (
                        <div key={industry.name} style={{ width: `${indPct}%`, minWidth: 0 }}>
                          {/* Industry label */}
                          <div className="px-1 py-px overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <span className="text-[0.625rem] text-white/60 truncate block">{industry.name}</span>
                          </div>
                          {/* Stock tiles */}
                          <div className="flex flex-wrap">
                            {industry.stocks.map((stock) => {
                              const stockPct = (stock.mcap / indMcap) * 100;
                              const bg = getColor(stock.change);
                              const minH = stock.mcap >= 10 ? 80 : stock.mcap >= 5 ? 60 : 40;

                              return (
                                <div
                                  key={stock.ticker}
                                  className="flex flex-col items-center justify-center cursor-pointer border border-black/20 select-none"
                                  style={{
                                    width: `${stockPct}%`,
                                    minWidth: 36,
                                    minHeight: minH,
                                    background: bg,
                                  }}
                                  onMouseMove={(e) => handleMouseMove(e, stock)}
                                  onMouseLeave={handleMouseLeave}
                                >
                                  <span className="text-[0.875rem] font-bold text-white leading-tight">{stock.ticker}</span>
                                  <span className="text-[0.75rem] text-white/90 leading-tight">
                                    {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Small sectors row */}
            <div className="flex">
              {SECTORS.filter((s) => {
                const sm = s.industries.reduce((a, i) => a + i.stocks.reduce((b, st) => b + st.mcap, 0), 0);
                return (sm / totalMcap) * 100 < 1;
              }).map((sector) => (
                <div key={sector.name} className="flex-1 min-w-0">
                  <div className="px-1 py-px" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <span className="text-[0.5rem] text-white/60 truncate block">{sector.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {hoveredStock && (
          <div
            className="fixed z-50 pointer-events-none rounded px-3 py-2"
            style={{
              left: hoveredStock.x + 12,
              top: hoveredStock.y - 10,
              background: "hsl(var(--text-primary))",
              color: "white",
              borderRadius: "var(--radius)",
              fontSize: "0.8125rem",
            }}
          >
            <div className="font-bold">{hoveredStock.stock.ticker}</div>
            <div className="text-white/80">{hoveredStock.stock.name}</div>
            <div>
              <span style={{ color: hoveredStock.stock.change >= 0 ? "#4caf70" : "#c0392b" }}>
                {hoveredStock.stock.change >= 0 ? "+" : ""}{hoveredStock.stock.change.toFixed(2)}%
              </span>
              {" · "}${hoveredStock.stock.price.toFixed(2)}
            </div>
          </div>
        )}

        {/* Caption */}
        <p className="text-[0.8125rem] mt-3 mb-6" style={{ color: "hsl(var(--text-muted))" }}>
          S&P500 stock performance by sector and industry. Size represents market cap, color represents relative performance.
        </p>

        {/* Ad Banner */}
        <AdBanner />
      </div>

      <Footer />
    </>
  );
}

export default HeatmapPage;
