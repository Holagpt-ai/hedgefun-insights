import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Search, ChevronLeft, Menu, X, TrendingUp, Pencil, Plus, Type, ChevronDown, Settings, Download, Lock, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModals } from "@/components/auth/AuthModals";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { searchTickers, EXCHANGE_LABELS, type SearchResult } from "@/lib/search-tickers";
import { toast } from "sonner";
import TradingViewChart, { type OHLCVData } from "@/components/charts/TradingViewChart";

const MARKET_DATA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data`;

interface ChartPoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

const TIME_RANGES = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "5Y"] as const;

type ChartViewMode = "recharts" | "tradingview";
type TVChartType = "area" | "line" | "candlestick" | "heikinashi";

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getDateRange(range: string) {
  const now = new Date();
  const to = fmtDate(now);
  let from: string;
  let multiplier = 1;
  let timespan = "day";

  switch (range) {
    case "1D": {
      from = to;
      multiplier = 5;
      timespan = "minute";
      break;
    }
    case "1W": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = fmtDate(d);
      multiplier = 30;
      timespan = "minute";
      break;
    }
    case "1M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      from = fmtDate(d);
      multiplier = 1;
      timespan = "hour";
      break;
    }
    case "3M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      from = fmtDate(d);
      break;
    }
    case "6M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      from = fmtDate(d);
      break;
    }
    case "YTD": from = `${now.getFullYear()}-01-01`; break;
    case "1Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      from = fmtDate(d);
      break;
    }
    case "5Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 5);
      from = fmtDate(d);
      timespan = "week";
      break;
    }
    default: {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      from = fmtDate(d);
    }
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
  if (["1D", "1W"].includes(range)) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (["1M", "3M"].includes(range)) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: range === "6M" || range === "YTD" || range === "1Y" ? undefined : "2-digit" });
}

function downloadCSV(data: ChartPoint[], ticker: string) {
  if (!data.length) return;
  const header = "Date,Open,High,Low,Close,Volume";
  const rows = data.map((d) =>
    `${d.date},${d.open},${d.high},${d.low},${d.close},${d.volume}`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ticker}_chart_data.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const chartCacheRef = useRef<Map<string, { data: ChartPoint[]; ts: number }>>(new Map());
  // Chart view mode
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("recharts");
  const [tvChartType, setTvChartType] = useState<TVChartType>("area");
  const [showViewsDropdown, setShowViewsDropdown] = useState(false);
  const viewsRef = useRef<HTMLDivElement>(null);

  // Search dropdown state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearchingTickers, setIsSearchingTickers] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(-1);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("chartPanelCollapsed", String(panelCollapsed));
  }, [panelCollapsed]);

  useEffect(() => {
    if (ticker) {
      document.title = `${ticker} Stock Chart | Stocksist`;
    } else {
      document.title = "Technical Chart | Stocksist";
    }
  }, [ticker]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) {
        setShowViewsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setSearchHighlight(-1);
  }, [searchResults]);

  // Fetch watchlist
  useEffect(() => {
    if (!user) return;
    supabase.from("watchlists").select("symbol").eq("user_id", user.id).then(({ data }) => {
      setWatchlist(data ?? []);
    });
  }, [user]);

  // Fetch chart data with AbortController for proper cleanup on ticker change
  useEffect(() => {
    if (!ticker) return;

    const cacheKey = `${ticker}:${timeRange}`;
    const cached = chartCacheRef.current.get(cacheKey);
    const STALE_MS = 5 * 60_000;
    if (cached && Date.now() - cached.ts < STALE_MS) {
      setChartData(cached.data);
      setError("");
      setLoading(false);
      setHoveredPoint(null);
      return;
    }

    const abortController = new AbortController();

    // Reset all chart state for the new ticker
    setChartData([]);
    setError("");
    setLoading(true);
    setHoveredPoint(null);

    const fetchHeaders = {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
    };

    async function doFetch(fromDate: string, toDate: string, mult: number, ts: string) {
      const url = new URL(MARKET_DATA_URL);
      url.searchParams.set("type", "aggregates");
      url.searchParams.set("ticker", ticker!);
      url.searchParams.set("multiplier", String(mult));
      url.searchParams.set("timespan", ts);
      url.searchParams.set("from", fromDate);
      url.searchParams.set("to", toDate);
      console.log(`[ChartPage] Fetching chart data: ${url.toString()}`);
      const r = await fetch(url.toString(), { signal: abortController.signal, headers: fetchHeaders });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const json = await r.json();
      return json?.results || json || [];
    }

    (async () => {
      try {
        const { from, to, multiplier, timespan } = getDateRange(timeRange);
        let results = await doFetch(from, to, multiplier, timespan);

        // 1D fallback: if no data today (pre-market/weekend), try previous trading day
        if (timeRange === "1D" && (!Array.isArray(results) || results.length === 0)) {
          const yesterday = new Date();
          // Go back up to 4 days to skip weekends
          for (let i = 1; i <= 4; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const fallbackDate = fmtDate(d);
            console.log(`[ChartPage] 1D fallback: trying ${fallbackDate}`);
            results = await doFetch(fallbackDate, fallbackDate, 5, "minute");
            if (Array.isArray(results) && results.length > 0) break;
          }
        }

        if (abortController.signal.aborted) return;
        if (!Array.isArray(results) || results.length === 0) {
          setError("Chart data temporarily unavailable. Please try again shortly.");
          setChartData([]);
        } else {
          const mapped = results.map((r: any) => ({
            date: new Date(r.t).toISOString(),
            close: r.c,
            open: r.o,
            high: r.h,
            low: r.l,
            volume: r.v,
          }));
          chartCacheRef.current.set(cacheKey, { data: mapped, ts: Date.now() });
          setChartData(mapped);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error(`[ChartPage] Fetch failed for ${ticker}:`, err.message);
        setError(`Unable to load chart data for ${ticker}. ${err.message}`);
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    })();

    return () => abortController.abort();
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

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearchingTickers(false);
      return;
    }
    setIsSearchingTickers(true);
    searchDebounceRef.current = setTimeout(async () => {
      const data = await searchTickers(value);
      setSearchResults(data);
      setShowSearchResults(true);
      setIsSearchingTickers(false);
    }, 200);
  }, []);

  const selectSearchResult = (r: SearchResult) => {
    setShowSearchResults(false);
    setSearchQuery("");
    setSearchHighlight(-1);
    navigate(`/chart/${r.ticker.toUpperCase()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchHighlight >= 0 && searchResults[searchHighlight]) {
      selectSearchResult(searchResults[searchHighlight]);
      return;
    }
    if (searchQuery.trim()) navigate(`/chart/${searchQuery.trim().toUpperCase()}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchResults || searchResults.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSearchHighlight((i) => (i < searchResults.length - 1 ? i + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSearchHighlight((i) => (i > 0 ? i - 1 : searchResults.length - 1));
        break;
      case "Enter":
        if (searchHighlight >= 0 && searchResults[searchHighlight]) {
          e.preventDefault();
          selectSearchResult(searchResults[searchHighlight]);
        }
        break;
      case "Escape":
        setShowSearchResults(false);
        setSearchHighlight(-1);
        break;
    }
  };

  const lastPoint = chartData[chartData.length - 1];
  const firstPoint = chartData[0];
  const currentPrice = lastPoint?.close ?? 0;
  const priceChange = lastPoint && firstPoint ? lastPoint.close - firstPoint.open : 0;
  const pctChange = firstPoint?.open ? (priceChange / firstPoint.open) * 100 : 0;
  const displayPoint = hoveredPoint || lastPoint;

  // Convert chartData to OHLCVData for TradingViewChart
  const ohlcvData: OHLCVData[] = chartData.map((d) => ({
    time: d.date.split("T")[0],
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
  }));

  const VIEW_OPTIONS: { type: TVChartType; label: string }[] = [
    { type: "area", label: "Area" },
    { type: "line", label: "Line" },
    { type: "candlestick", label: "Candlestick" },
    { type: "heikinashi", label: "Heikin-Ashi" },
  ];

  const currentViewLabel = VIEW_OPTIONS.find((v) => v.type === tvChartType)?.label ?? "Area";

  const searchDropdown = (
    <>
      {showSearchResults && searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
          {searchResults.map((r, index) => (
            <button
              key={r.ticker}
              onClick={() => selectSearchResult(r)}
              className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors text-left border-b border-border last:border-0 ${
                index === searchHighlight ? "bg-accent" : "hover:bg-accent"
              }`}
            >
              <span className="text-sm font-semibold text-accent-blue">{r.ticker}</span>
              <span className="text-sm text-foreground truncate flex-1">{r.name}</span>
              <span className="text-[0.6875rem] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {EXCHANGE_LABELS[r.exchange ?? ""] ?? r.exchange ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}
      {showSearchResults && searchResults.length === 0 && searchQuery.trim().length >= 1 && !isSearchingTickers && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-muted-foreground">
          No results for "{searchQuery}"
        </div>
      )}
      {isSearchingTickers && searchQuery.trim().length >= 1 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-muted-foreground">
          Searching...
        </div>
      )}
    </>
  );

  // LANDING STATE
  if (!ticker) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <ChartHeader
          searchQuery={searchQuery}
          setSearchQuery={handleSearchInput}
          onSearchSubmit={handleSearchSubmit}
          onSearchKeyDown={handleSearchKeyDown}
          searchDropdown={searchDropdown}
          searchContainerRef={searchContainerRef}
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
              <div ref={searchContainerRef} className="relative mb-3">
                <form onSubmit={handleSearchSubmit}>
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Change symbol..."
                    className="w-full h-12 pl-11 pr-10 border border-border rounded-[var(--radius)] bg-background text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">/</span>
                </form>
                {searchDropdown}
              </div>
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
        setSearchQuery={handleSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onSearchKeyDown={handleSearchKeyDown}
        searchDropdown={searchDropdown}
        searchContainerRef={searchContainerRef}
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
              {/* Views dropdown */}
              <div ref={viewsRef} className="relative">
                <button
                  onClick={() => setShowViewsDropdown((v) => !v)}
                  className="h-8 px-2.5 flex items-center gap-1 border border-border rounded-[var(--radius)] text-[0.8125rem] text-foreground hover:bg-accent transition-colors"
                >
                  <span>▲ {currentViewLabel}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
                {showViewsDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50 min-w-[160px]">
                    {VIEW_OPTIONS.map(({ type, label }) => (
                      <button
                        key={type}
                        onClick={() => {
                          setTvChartType(type);
                          setChartViewMode("tradingview");
                          setShowViewsDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-sm text-left transition-colors ${
                          tvChartType === type && chartViewMode === "tradingview"
                            ? "bg-accent text-accent-blue font-medium"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <div className="border-t border-border">
                      <button
                        onClick={() => {
                          setChartViewMode("recharts");
                          setShowViewsDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-sm text-left transition-colors ${
                          chartViewMode === "recharts"
                            ? "bg-accent text-accent-blue font-medium"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        Default (Area)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <ToolbarBtn
                label="Studies"
                hasChevron
                onClick={() => toast.info("Studies — Coming Soon", { description: "Technical studies will be available in a future update." })}
              />
              <ToolbarBtn
                label="Signals"
                hasChevron
                onClick={() => toast.info("Signals — Coming Soon", { description: "Trading signals will be available in a future update." })}
              />
              <ToolbarBtn
                label="Events"
                hasChevron
                onClick={() => toast.info("Events — Coming Soon", { description: "Market events overlay will be available in a future update." })}
              />
              <ToolbarBtn
                label="Download"
                hasChevron
                onClick={() => {
                  if (!chartData.length) {
                    toast.error("No chart data to download.");
                    return;
                  }
                  downloadCSV(chartData, ticker);
                  toast.success(`Downloaded ${ticker} chart data as CSV.`);
                }}
              />
              <ToolbarBtn
                icon={<Settings className="h-4 w-4" />}
                onClick={() => toast.info("Settings — Coming Soon", { description: "Chart settings will be available in a future update." })}
              />
            </div>
          </div>

          {/* Chart Area */}
          <div className="flex-1 relative min-h-0">
            {/* Ticker watermark */}
            {ticker && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 select-none">
                <span className="text-[120px] font-bold text-foreground" style={{ opacity: 0.08, lineHeight: 1 }}>
                  {ticker}
                </span>
              </div>
            )}
            {loading ? (
              <div className="flex flex-col h-full p-4 gap-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="flex-1 w-full rounded-[var(--radius)]" />
                <Skeleton className="h-[80px] w-full rounded-[var(--radius)]" />
                <Skeleton className="h-10 w-64 mx-auto" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
              </div>
            ) : chartViewMode === "tradingview" ? (
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0 p-2">
                  <TradingViewChart
                    data={ohlcvData}
                    ticker={ticker}
                    isPositive={priceChange >= 0}
                    height={600}
                    loading={false}
                    chartType={tvChartType}
                    onChartTypeChange={setTvChartType}
                    hideToolbar
                  />
                </div>
                <div className="h-10 flex items-center justify-center gap-1 border-t border-border shrink-0 px-2 overflow-x-auto">
                  {TIME_RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setTimeRange(r)}
                      className={`px-2.5 py-1 text-[0.8125rem] rounded-[var(--radius)] transition-colors ${
                        timeRange === r
                          ? "bg-accent-blue text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
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
                    <>
                      <div className="hidden sm:block">
                        <div className="flex gap-4 text-[0.8125rem]">
                          <span><span className="text-muted-foreground">Price:</span> <span className="text-foreground">{displayPoint.close.toFixed(2)}</span></span>
                          <span><span className="text-muted-foreground">Open:</span> <span className="text-foreground">{displayPoint.open.toFixed(2)}</span></span>
                          <span><span className="text-muted-foreground">Close:</span> <span className="text-foreground">{displayPoint.close.toFixed(2)}</span></span>
                          <span><span className="text-muted-foreground">Change:</span> <span className="text-foreground">{(displayPoint.close - displayPoint.open).toFixed(2)}</span></span>
                        </div>
                        <div className="flex gap-4 text-[0.8125rem]">
                          <span><span className="text-muted-foreground">Vol:</span> <span className="text-foreground">{abbr(displayPoint.volume)}</span></span>
                          <span><span className="text-muted-foreground">High:</span> <span className="text-foreground">{displayPoint.high.toFixed(2)}</span></span>
                          <span><span className="text-muted-foreground">Low:</span> <span className="text-foreground">{displayPoint.low.toFixed(2)}</span></span>
                          <span><span className="text-muted-foreground">Chg.%:</span> <span className="text-foreground">{((displayPoint.close - displayPoint.open) / displayPoint.open * 100).toFixed(2)}%</span></span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:hidden">
                        {[
                          { label: "Price", value: displayPoint.close.toFixed(2) },
                          { label: "Open", value: displayPoint.open.toFixed(2) },
                          { label: "Close", value: displayPoint.close.toFixed(2) },
                          { label: "Change", value: (displayPoint.close - displayPoint.open).toFixed(2) },
                          { label: "Vol", value: abbr(displayPoint.volume) },
                          { label: "High", value: displayPoint.high.toFixed(2) },
                          { label: "Low", value: displayPoint.low.toFixed(2) },
                          { label: "Chg.%", value: `${((displayPoint.close - displayPoint.open) / displayPoint.open * 100).toFixed(2)}%` },
                        ].map((s) => (
                          <div key={s.label} className="overflow-hidden text-ellipsis whitespace-nowrap">
                            <span className="text-[0.6875rem] text-muted-foreground">{s.label}</span>
                            <br />
                            <span className="text-[0.8125rem] font-medium text-foreground">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
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
                      <Tooltip content={() => null} />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke="hsl(var(--accent-blue))"
                        strokeWidth={1.5}
                        fill="url(#areaFill)"
                        dot={false}
                        activeDot={{ r: 3, fill: "hsl(var(--accent-blue))" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Volume Chart */}
                <div className="h-[80px] shrink-0 border-t border-border">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} syncId="chart" margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis
                        orientation="right"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => abbr(v)}
                        width={55}
                      />
                      <Tooltip content={() => null} />
                      <Bar dataKey="volume" fill="hsl(var(--muted-foreground))" opacity={0.3} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Time Range Selector */}
                <div className="h-10 flex items-center justify-center gap-1 border-t border-border shrink-0 px-2 overflow-x-auto">
                  {TIME_RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setTimeRange(r)}
                      className={`px-2.5 py-1 text-[0.8125rem] rounded-[var(--radius)] transition-colors ${
                        timeRange === r
                          ? "bg-accent-blue text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
  searchQuery, setSearchQuery, onSearchSubmit, onSearchKeyDown, searchDropdown, searchContainerRef, onAuthMode, user,
}: {
  searchQuery: string; setSearchQuery: (v: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchDropdown: React.ReactNode;
  searchContainerRef: React.RefObject<HTMLDivElement>;
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
          <span className="text-xs font-bold text-primary-foreground">S</span>
        </div>
        <span className="hidden sm:block font-display text-base text-foreground font-semibold">Stocksist</span>
      </div>
      <div ref={searchContainerRef} className="relative flex-1 max-w-[600px]">
        <form onSubmit={onSearchSubmit}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {}}
            onKeyDown={onSearchKeyDown}
            placeholder="Change symbol..."
            className="w-full h-8 pl-9 pr-8 border border-border rounded-[var(--radius)] bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded border border-border">/</span>
        </form>
        {searchDropdown}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => navigate("/chart")} className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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
  const [panelSearch, setPanelSearch] = useState("");
  const [panelResults, setPanelResults] = useState<SearchResult[]>([]);
  const [isPanelSearching, setIsPanelSearching] = useState(false);
  const panelDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handlePanelSearch = useCallback((value: string) => {
    setPanelSearch(value);
    if (panelDebounceRef.current) clearTimeout(panelDebounceRef.current);
    if (!value.trim()) { setPanelResults([]); setIsPanelSearching(false); return; }
    setIsPanelSearching(true);
    panelDebounceRef.current = setTimeout(async () => {
      const data = await searchTickers(value);
      setPanelResults(data);
      setIsPanelSearching(false);
    }, 200);
  }, []);

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
                {/* Panel ticker search */}
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={panelSearch}
                    onChange={(e) => handlePanelSearch(e.target.value)}
                    placeholder="Search ticker..."
                    className="w-full h-8 pl-8 pr-3 border border-border rounded-[var(--radius)] bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-blue"
                  />
                  {panelResults.length > 0 && panelSearch.trim() && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-[200px] overflow-y-auto">
                      {panelResults.map((r) => (
                        <button
                          key={r.ticker}
                          onClick={() => {
                            onTickerClick(r.ticker.toUpperCase());
                            setPanelSearch("");
                            setPanelResults([]);
                          }}
                          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-accent transition-colors border-b border-border last:border-0"
                        >
                          <span className="text-sm font-semibold text-accent-blue">{r.ticker}</span>
                          <span className="text-xs text-muted-foreground truncate flex-1">{r.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {isPanelSearching && panelSearch.trim() && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg z-50 px-3 py-2 text-xs text-muted-foreground">
                      Searching...
                    </div>
                  )}
                </div>
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

function ToolbarBtn({ icon, label, hasChevron, onClick }: { icon?: React.ReactNode; label?: string; hasChevron?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-2.5 flex items-center gap-1 border border-border rounded-[var(--radius)] text-[0.8125rem] text-foreground hover:bg-accent transition-colors"
    >
      {icon}
      {label && <span>{label}</span>}
      {hasChevron && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}
