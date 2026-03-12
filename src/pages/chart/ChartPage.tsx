import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, ChevronLeft, Menu, X, TrendingUp, Pencil, Plus, Type, ChevronDown, Settings, Download, Sun, Lock, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModals } from "@/components/auth/AuthModals";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

const MARKET_DATA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data`;

interface ChartPoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

const TIME_RANGES = ["1D", "2D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "All"] as const;

function getDateRange(range: string) {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from: string;
  let multiplier = 1;
  let timespan = "day";

  switch (range) {
    case "1D": from = to; multiplier = 5; timespan = "minute"; break;
    case "2D": { const d = new Date(now); d.setDate(d.getDate() - 2); from = d.toISOString().split("T")[0]; multiplier = 5; timespan = "minute"; break; }
    case "5D": { const d = new Date(now); d.setDate(d.getDate() - 5); from = d.toISOString().split("T")[0]; multiplier = 15; timespan = "minute"; break; }
    case "1M": { const d = new Date(now); d.setMonth(d.getMonth() - 1); from = d.toISOString().split("T")[0]; break; }
    case "3M": { const d = new Date(now); d.setMonth(d.getMonth() - 3); from = d.toISOString().split("T")[0]; break; }
    case "6M": { const d = new Date(now); d.setMonth(d.getMonth() - 6); from = d.toISOString().split("T")[0]; break; }
    case "YTD": from = `${now.getFullYear()}-01-01`; break;
    case "1Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); from = d.toISOString().split("T")[0]; break; }
    case "3Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 3); from = d.toISOString().split("T")[0]; timespan = "week"; break; }
    case "5Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 5); from = d.toISOString().split("T")[0]; timespan = "week"; break; }
    case "All": { const d = new Date(now); d.setFullYear(d.getFullYear() - 10); from = d.toISOString().split("T")[0]; timespan = "month"; break; }
    default: { const d = new Date(now); d.setMonth(d.getMonth() - 6); from = d.toISOString().split("T")[0]; }
  }
  return { from, to, multiplier, timespan };
}

function abbr(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(0) + "m";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "m";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return n.toString();
}

function formatXLabel(dateStr: string, range: string): string {
  const d = new Date(dateStr);
  if (["1D", "2D", "5D"].includes(range)) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (["1M", "3M"].includes(range)) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: range === "6M" || range === "YTD" || range === "1Y" ? undefined : "2-digit" });
}

export default function ChartPage() {
  const { ticker: rawTicker } = useParams<{ ticker?: string }>();
  const ticker = rawTicker?.toUpperCase() || "";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(() => localStorage.getItem("chartPanelCollapsed") === "true");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState("6M");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tickerDetails, setTickerDetails] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [watchlist, setWatchlist] = useState<{ symbol: string }[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);

  useEffect(() => {
    localStorage.setItem("chartPanelCollapsed", String(panelCollapsed));
  }, [panelCollapsed]);

  useEffect(() => {
    if (ticker) {
      document.title = `${ticker} Stock Chart | HedgeFun`;
    } else {
      document.title = "Technical Chart | HedgeFun";
    }
  }, [ticker]);

  // Fetch watchlist
  useEffect(() => {
    if (!user) return;
    supabase.from("watchlists").select("symbol").eq("user_id", user.id).then(({ data }) => {
      setWatchlist(data ?? []);
    });
  }, [user]);

  // Fetch chart data
  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError("");
    const { from, to, multiplier, timespan } = getDateRange(timeRange);
    const url = new URL(MARKET_DATA_URL);
    url.searchParams.set("type", "aggregates");
    url.searchParams.set("ticker", ticker);
    url.searchParams.set("multiplier", String(multiplier));
    url.searchParams.set("timespan", timespan);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);

    fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
    })
      .then((r) => r.json())
      .then((data) => {
        const results = data?.results || data || [];
        if (!Array.isArray(results) || results.length === 0) {
          setError(`Unable to load chart data for ${ticker}. Please check the symbol and try again.`);
          setChartData([]);
        } else {
          setChartData(
            results.map((r: any) => ({
              date: new Date(r.t).toISOString(),
              close: r.c,
              open: r.o,
              high: r.h,
              low: r.l,
              volume: r.v,
            }))
          );
        }
      })
      .catch(() => setError(`Unable to load chart data for ${ticker}. Please check the symbol and try again.`))
      .finally(() => setLoading(false));
  }, [ticker, timeRange]);

  // Fetch snapshot + details
  useEffect(() => {
    if (!ticker) return;
    const url1 = new URL(MARKET_DATA_URL);
    url1.searchParams.set("type", "snapshot");
    url1.searchParams.set("ticker", ticker);
    const url2 = new URL(MARKET_DATA_URL);
    url2.searchParams.set("type", "details");
    url2.searchParams.set("ticker", ticker);
    const headers = {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
    };
    Promise.all([
      fetch(url1.toString(), { headers }).then((r) => r.json()).catch(() => null),
      fetch(url2.toString(), { headers }).then((r) => r.json()).catch(() => null),
    ]).then(([snap, det]) => {
      setSnapshot(snap);
      setTickerDetails(det?.results || det);
    });
  }, [ticker]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(`/chart/${searchQuery.trim().toUpperCase()}`);
  };

  const lastPoint = chartData[chartData.length - 1];
  const firstPoint = chartData[0];
  const currentPrice = lastPoint?.close ?? 0;
  const priceChange = lastPoint && firstPoint ? lastPoint.close - firstPoint.open : 0;
  const pctChange = firstPoint?.open ? (priceChange / firstPoint.open) * 100 : 0;
  const displayPoint = hoveredPoint || lastPoint;

  // LANDING STATE
  if (!ticker) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <ChartHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          onAuthMode={setAuthMode}
          user={user}
        />
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="max-w-[600px] w-full text-center">
              <h1 className="text-[2rem] font-bold text-foreground mb-4">Technical Analysis Stock Charts</h1>
              <p className="text-base text-muted-foreground mb-8">
                Search for a stock symbol to view an interactive chart with technical indicators, drawing tools, and comparison features.
              </p>
              <form onSubmit={handleSearchSubmit} className="relative mb-3">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Change symbol..."
                  className="w-full h-12 pl-11 pr-10 border border-border rounded-[var(--radius)] bg-background text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">/</span>
              </form>
              <p className="text-sm text-muted-foreground">
                Examples:{" "}
                {["NVDA", "AAPL", "SPY", "QQQ"].map((t, i) => (
                  <span key={t}>
                    {i > 0 && ", "}
                    <button onClick={() => navigate(`/chart/${t}`)} className="text-accent-blue hover:underline">{t}</button>
                  </span>
                ))}
              </p>
            </div>
          </div>
          <RightPanel
            collapsed={panelCollapsed}
            onToggle={() => setPanelCollapsed(!panelCollapsed)}
            user={user}
            watchlist={watchlist}
            onTickerClick={(t) => navigate(`/chart/${t}`)}
            onAuthMode={setAuthMode}
            theme={theme}
          />
        </div>
        <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
      </div>
    );
  }

  // CHART STATE
  return (
    <div className="h-screen flex flex-col bg-background">
      <ChartHeader
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onAuthMode={setAuthMode}
        user={user}
      />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="h-12 flex items-center px-3 gap-1 border-b border-border shrink-0">
            <div className="flex items-center gap-1">
              <ToolbarBtn icon={<TrendingUp className="h-4 w-4" />} />
              <ToolbarBtn icon={<Pencil className="h-4 w-4" />} />
              <ToolbarBtn icon={<Plus className="h-4 w-4" />} label="" />
              <ToolbarBtn icon={<Type className="h-4 w-4" />} />
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <ToolbarBtn label="▲ Area" />
              <ToolbarBtn label="1D" />
              <ToolbarBtn label="Views" hasChevron />
              <ToolbarBtn label="Studies" hasChevron />
              <ToolbarBtn label="Signals" hasChevron />
              <ToolbarBtn label="Events" hasChevron />
              <ToolbarBtn label="Download" hasChevron />
              <ToolbarBtn icon={<Settings className="h-4 w-4" />} hasChevron />
            </div>
          </div>

          {/* Chart Area */}
          <div className="flex-1 relative min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Skeleton className="w-full h-64 mb-4 mx-auto max-w-2xl" />
                  <p className="text-sm text-muted-foreground">Loading chart data...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* OHLCV Overlay */}
                <div className="absolute top-3 left-3 z-10">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xl font-bold text-foreground">{ticker}</span>
                    <span className="text-lg font-semibold text-foreground">{currentPrice.toFixed(2)}</span>
                    <span className={`text-lg font-medium ${priceChange >= 0 ? "text-green" : "text-red"}`}>
                      {priceChange >= 0 ? "▲" : "▼"} {Math.abs(priceChange).toFixed(2)} ({priceChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%)
                    </span>
                  </div>
                  {displayPoint && (
                    <div className="flex gap-4 text-[0.8125rem]">
                      <span><span className="text-muted-foreground">Price:</span> <span className="text-foreground">{displayPoint.close.toFixed(2)}</span></span>
                      <span><span className="text-muted-foreground">Open:</span> <span className="text-foreground">{displayPoint.open.toFixed(2)}</span></span>
                      <span><span className="text-muted-foreground">Close:</span> <span className="text-foreground">{displayPoint.close.toFixed(2)}</span></span>
                      <span><span className="text-muted-foreground">Change:</span> <span className="text-foreground">{(displayPoint.close - displayPoint.open).toFixed(2)}</span></span>
                    </div>
                  )}
                  {displayPoint && (
                    <div className="flex gap-4 text-[0.8125rem]">
                      <span><span className="text-muted-foreground">Vol:</span> <span className="text-foreground">{abbr(displayPoint.volume)}</span></span>
                      <span><span className="text-muted-foreground">High:</span> <span className="text-foreground">{displayPoint.high.toFixed(2)}</span></span>
                      <span><span className="text-muted-foreground">Low:</span> <span className="text-foreground">{displayPoint.low.toFixed(2)}</span></span>
                      <span><span className="text-muted-foreground">Chg.%:</span> <span className="text-foreground">{((displayPoint.close - displayPoint.open) / displayPoint.open * 100).toFixed(2)}%</span></span>
                    </div>
                  )}
                </div>

                {/* Price Chart */}
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} syncId="chart" margin={{ top: 60, right: 60, left: 0, bottom: 0 }}
                      onMouseMove={(e: any) => {
                        if (e?.activePayload?.[0]?.payload) setHoveredPoint(e.activePayload[0].payload);
                      }}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      <defs>
                        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--accent-blue))" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="hsl(var(--accent-blue))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="" vertical={true} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => formatXLabel(v, timeRange)}
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                        minTickGap={50}
                      />
                      <YAxis
                        orientation="right"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v.toFixed(2)}
                      />
                      <ReferenceLine y={currentPrice} stroke="hsl(var(--border))" strokeDasharray="4 4" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as ChartPoint;
                          return (
                            <div className="bg-surface-card border border-border rounded-[var(--radius)] p-2 text-xs shadow-lg">
                              <div className="font-medium text-foreground mb-1">{new Date(p.date).toLocaleDateString()}</div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                                <span>O: {p.open.toFixed(2)}</span><span>H: {p.high.toFixed(2)}</span>
                                <span>L: {p.low.toFixed(2)}</span><span>C: {p.close.toFixed(2)}</span>
                              </div>
                              <div className="text-muted-foreground mt-0.5">Vol: {abbr(p.volume)}</div>
                            </div>
                          );
                        }}
                      />
                      <Area type="monotone" dataKey="close" stroke="hsl(var(--accent-blue))" strokeWidth={1.5} fill="url(#areaFill)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Current price badge */}
                {currentPrice > 0 && (
                  <div className="absolute right-[52px] z-10 bg-green text-white text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ top: "50%" }}>
                    {currentPrice.toFixed(2)}
                  </div>
                )}

                {/* Volume Chart */}
                <div className="h-[120px] border-t border-border shrink-0">
                  <div className="px-3 pt-1">
                    <span className="text-xs font-semibold text-muted-foreground">▶ Plots</span>
                  </div>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={chartData} syncId="chart" margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis
                        orientation="right"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => abbr(v)}
                      />
                      <Bar
                        dataKey="volume"
                        shape={(props: any) => {
                          const { x, y, width, height, payload } = props;
                          const color = payload.close >= payload.open ? "#4CAF50" : "#F44336";
                          return <rect x={x} y={y} width={width} height={height} fill={color} />;
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Time Range Bar */}
          <div className="h-10 flex items-center justify-center gap-1 border-t border-border shrink-0 px-2">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-1 text-[0.8125rem] rounded-[var(--radius)] transition-colors ${
                  timeRange === r
                    ? "bg-accent-blue text-white font-semibold"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <RightPanel
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed(!panelCollapsed)}
          user={user}
          watchlist={watchlist}
          onTickerClick={(t) => navigate(`/chart/${t}`)}
          onAuthMode={setAuthMode}
          theme={theme}
        />
      </div>
      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
    </div>
  );
}

// --- Sub-components ---

function ChartHeader({
  searchQuery, setSearchQuery, onSearchSubmit, onAuthMode, user,
}: {
  searchQuery: string; setSearchQuery: (v: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onAuthMode: (m: "login" | "signup") => void; user: any;
}) {
  const navigate = useNavigate();
  return (
    <header className="h-12 flex items-center px-4 gap-3 border-b border-border bg-surface-card shrink-0">
      <button onClick={() => window.history.back()} className="text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button className="text-muted-foreground hover:text-foreground">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate("/")}>
        <div className="h-7 w-7 rounded-md bg-accent-blue flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">HF</span>
        </div>
        <span className="hidden sm:block font-display text-base text-foreground font-semibold">HedgeFun</span>
      </div>
      <form onSubmit={onSearchSubmit} className="relative flex-1 max-w-[600px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Change symbol..."
          className="w-full h-8 pl-9 pr-8 border border-border rounded-[var(--radius)] bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded border border-border">/</span>
      </form>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => navigate("/")} className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" /> Exit Chart View
        </button>
        {!user && (
          <>
            <Button variant="ghost" size="sm" className="text-sm" onClick={() => onAuthMode("login")}>Log In</Button>
            <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground text-sm" onClick={() => onAuthMode("signup")}>Sign Up</Button>
          </>
        )}
      </div>
    </header>
  );
}

function RightPanel({
  collapsed, onToggle, user, watchlist, onTickerClick, onAuthMode, theme,
}: {
  collapsed: boolean; onToggle: () => void; user: any;
  watchlist: { symbol: string }[]; onTickerClick: (t: string) => void;
  onAuthMode: (m: "login" | "signup") => void; theme: string;
}) {
  return (
    <div
      className={`border-l border-border bg-surface-card shrink-0 flex flex-col transition-all duration-200 ease-in-out overflow-hidden ${
        collapsed ? "w-0 border-l-0" : "w-[300px]"
      } hidden md:flex`}
    >
      {!collapsed && (
        <>
          <div className="flex-1 overflow-y-auto">
            {user ? (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Watchlist</h3>
                {watchlist.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tickers in your watchlist.</p>
                ) : (
                  watchlist.map((w) => (
                    <button
                      key={w.symbol}
                      onClick={() => onTickerClick(w.symbol)}
                      className="w-full text-left px-2 py-2 text-sm text-accent-blue font-semibold hover:bg-accent border-b border-border rounded-none"
                    >
                      {w.symbol}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <h3 className="text-lg font-bold text-foreground mb-2">Get your watchlists here</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Log in or create a free account to see your watchlists in this sidebar. This makes it easy to quickly toggle between charts.
                </p>
                <Button className="w-full bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground mb-3" onClick={() => onAuthMode("login")}>
                  Log In
                </Button>
                <Button variant="outline" className="w-full border-accent-blue text-accent-blue hover:bg-accent-blue/5" onClick={() => onAuthMode("signup")}>
                  Create Free Account
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-foreground font-medium">Theme</span>
              <div className="flex border border-border rounded-[var(--radius)] overflow-hidden">
                <span className={`px-3 py-1 text-xs ${theme === "light" ? "bg-accent-blue text-white" : "text-muted-foreground"}`}>☀ Light</span>
                <span className={`px-3 py-1 text-xs flex items-center gap-1 ${theme === "dark" ? "bg-accent-blue text-white" : "text-muted-foreground"}`}>
                  <Lock className="h-3 w-3" /> Dark
                </span>
              </div>
            </div>
            <button onClick={onToggle} className="w-full text-left text-sm text-muted-foreground hover:text-foreground flex items-center justify-between border-t border-border pt-3">
              Collapse <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
      {collapsed && (
        <button onClick={onToggle} className="p-2 mt-2 mx-auto text-muted-foreground hover:text-foreground">
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ToolbarBtn({ icon, label, hasChevron }: { icon?: React.ReactNode; label?: string; hasChevron?: boolean }) {
  return (
    <button className="h-8 px-2.5 flex items-center gap-1 border border-border rounded-[var(--radius)] text-[0.8125rem] text-foreground hover:bg-accent transition-colors">
      {icon}
      {label && <span>{label}</span>}
      {hasChevron && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}
