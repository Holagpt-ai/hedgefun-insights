import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { AdBanner } from "@/components/layout/AdBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, ChevronDown } from "lucide-react";

const TIMEFRAMES = ["1D", "1W", "1M", "YTD", "1Y"] as const;

interface StockTile {
  ticker: string;
  name: string;
  change: number;
  mcap: number;
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

const SECTOR_ORDER = [
  "Technology", "Financials", "Consumer Discretionary", "Communication Services",
  "Healthcare", "Industrials", "Consumer Staples", "Energy",
  "Utilities", "Real Estate", "Materials",
];

function buildSectors(rows: any[]): Sector[] {
  const sectorMap = new Map<string, Map<string, StockTile[]>>();

  for (const row of rows) {
    const sector = row.sector || "Other";
    const industry = row.industry || "Other";
    if (!sectorMap.has(sector)) sectorMap.set(sector, new Map());
    const indMap = sectorMap.get(sector)!;
    if (!indMap.has(industry)) indMap.set(industry, []);
    indMap.get(industry)!.push({
      ticker: row.symbol,
      name: row.name,
      change: row.change_percent ?? 0,
      mcap: row.market_cap ?? 0,
      price: row.price ?? 0,
    });
  }

  // Sort stocks within each industry by market cap descending
  for (const indMap of sectorMap.values()) {
    for (const stocks of indMap.values()) {
      stocks.sort((a, b) => b.mcap - a.mcap);
    }
  }

  // Build sectors in preferred order, then any remaining
  const result: Sector[] = [];
  const handled = new Set<string>();

  for (const sectorName of SECTOR_ORDER) {
    const indMap = sectorMap.get(sectorName);
    if (!indMap) continue;
    handled.add(sectorName);
    const industries: Industry[] = [];
    for (const [indName, stocks] of indMap) {
      industries.push({ name: indName, stocks });
    }
    // Sort industries by total mcap descending
    industries.sort((a, b) =>
      b.stocks.reduce((s, st) => s + st.mcap, 0) - a.stocks.reduce((s, st) => s + st.mcap, 0)
    );
    result.push({ name: sectorName, industries });
  }

  for (const [sectorName, indMap] of sectorMap) {
    if (handled.has(sectorName)) continue;
    const industries: Industry[] = [];
    for (const [indName, stocks] of indMap) {
      industries.push({ name: indName, stocks });
    }
    industries.sort((a, b) =>
      b.stocks.reduce((s, st) => s + st.mcap, 0) - a.stocks.reduce((s, st) => s + st.mcap, 0)
    );
    result.push({ name: sectorName, industries });
  }

  return result;
}

function getColor(change: number): string {
  if (change > 2) return "#1a7a3c";
  if (change > 1) return "#2d9e52";
  if (change > 0) return "#4caf70";
  if (change === 0) return "#666";
  if (change > -1) return "#c0392b";
  if (change > -2) return "#a93226";
  return "#8b0000";
}

function HeatmapPage() {
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<string>("1D");
  const [tfOpen, setTfOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [hoveredStock, setHoveredStock] = useState<{ stock: StockTile; x: number; y: number } | null>(null);

  const { data: stockRows, isLoading } = useQuery({
    queryKey: ["heatmap-stocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, market_cap, sector, industry")
        .not("sector", "is", null)
        .not("market_cap", "is", null)
        .gt("market_cap", 0)
        .order("market_cap", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  const sectors = useMemo(() => buildSectors(stockRows ?? []), [stockRows]);

  const totalMcap = useMemo(() => {
    return sectors.reduce((sum, s) => s.industries.reduce((s2, i) => s2 + i.stocks.reduce((s3, st) => s3 + st.mcap, 0), sum), 0);
  }, [sectors]);

  const handleMouseMove = useCallback((e: React.MouseEvent, stock: StockTile) => {
    setHoveredStock({ stock, x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredStock(null);
  }, []);

  useEffect(() => {
    document.title = "Market Heatmap | HedgeFun";
  }, []);

  return (
    <>
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

            <button onClick={() => navigate("/pro")} className="flex items-center gap-1.5 text-[0.875rem] px-3 py-1.5 rounded border border-border" style={{ color: "hsl(var(--text-muted))" }}>
              Full Width <Lock className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Treemap */}
        <div className="rounded overflow-hidden" style={{ minHeight: 500, background: "#1a1a2e" }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-[500px]">
              <div className="space-y-3 w-full px-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ) : sectors.length === 0 ? (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground text-sm">
              No stock data available. Run the stock sync to populate sector and industry data.
            </div>
          ) : (
            <div className="w-full h-full" style={{ minHeight: 500 }}>
              {sectors.map((sector) => {
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
                                const mcapB = stock.mcap / 1e9;
                                const minH = mcapB >= 500 ? 80 : mcapB >= 100 ? 60 : 40;

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
                                    onClick={() => navigate(`/stocks/${stock.ticker.toLowerCase()}`)}
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
                {sectors.filter((s) => {
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
          )}
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
    </>
  );
}

export default HeatmapPage;
