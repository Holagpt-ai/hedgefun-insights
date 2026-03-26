import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAggregates } from "@/lib/polygon";
import { usePageSeo } from "@/hooks/usePageSeo";
import { Search, Lock, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { AdBanner } from "@/components/layout/AdBanner";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(0, 72%, 51%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(263, 70%, 50%)",
  "hsl(330, 80%, 60%)",
];

const TIME_RANGES = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;

const POPULAR_COMPARISONS = [
  ["QQQ", "SPY"], ["VOO", "VUG"], ["QQQ", "VGT"], ["IVV", "VOO"],
  ["VOO", "VTI"], ["QQQ", "VOOG"], ["IVV", "VTI"], ["IVV", "SPY"],
  ["SPY", "VOO"], ["QQQ", "VOO"], ["QQQ", "QQQM"], ["VT", "VTI"],
  ["QQQ", "TQQQ"], ["ITOT", "VTI"], ["JEPI", "JEPQ"], ["JEPI", "QYLD"],
];

interface EtfData {
  symbol: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  total_assets: number | null;
  expense_ratio: number | null;
  holdings: number | null;
  ytd_return: number | null;
  volume: number | null;
}

function getDateRange(range: string) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from: string;
  let timespan = "day";
  let multiplier = 1;

  switch (range) {
    case "1M": from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10); break;
    case "3M": from = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10); break;
    case "6M": from = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10); break;
    case "YTD": from = `${now.getFullYear()}-01-01`; break;
    case "1Y": from = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10); break;
    case "3Y": from = new Date(now.getTime() - 3 * 365 * 86400000).toISOString().slice(0, 10); timespan = "week"; break;
    case "5Y": from = new Date(now.getTime() - 5 * 365 * 86400000).toISOString().slice(0, 10); timespan = "month"; break;
    default: from = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  }
  return { from, to, multiplier, timespan };
}

function abbr(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export default function EtfComparePage() {
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<string>("1Y");
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");
  const [showResults, setShowResults] = useState(false);

  usePageSeo({
    title: "Compare ETFs Side by Side | HedgeFun",
    description: "Compare ETF performance, expense ratios, and holdings side by side with interactive charts.",
    canonical: "https://hedge-fun-analysis.lovable.app/etf/compare",
  });

  // Fetch all ETFs for search
  const { data: allEtfs } = useQuery({
    queryKey: ["etfs-compare-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etfs")
        .select("symbol, name, price, change_percent, total_assets, expense_ratio, holdings, ytd_return, volume");
      if (error) throw error;
      return data as EtfData[];
    },
  });

  const etfMap = useMemo(() => {
    const map: Record<string, EtfData> = {};
    for (const e of allEtfs ?? []) map[e.symbol] = e;
    return map;
  }, [allEtfs]);

  const allSymbols = useMemo(() => Object.keys(etfMap), [etfMap]);

  const searchResults = useMemo(() => {
    if (searchValue.length < 1) return [];
    const q = searchValue.toUpperCase();
    return allSymbols
      .filter((s) => s.includes(q) || (etfMap[s]?.name ?? "").toUpperCase().includes(q))
      .filter((s) => !selectedTickers.includes(s))
      .slice(0, 8);
  }, [searchValue, allSymbols, etfMap, selectedTickers]);

  // Fetch historical data for each selected ticker
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);
  const chartQueries = useQueries({
    queries: selectedTickers.map((ticker) => ({
      queryKey: ["etf-compare-chart", ticker, timeRange],
      queryFn: () => getAggregates(ticker, dateRange.multiplier, dateRange.timespan, dateRange.from, dateRange.to),
      staleTime: 60_000,
      enabled: selectedTickers.length > 0,
    })),
  });

  const chartLoading = chartQueries.some((q) => q.isLoading);

  // Normalize all series to percentage return from start
  const chartData = useMemo(() => {
    if (selectedTickers.length === 0) return [];

    // Find the series with the most data points as the base timeline
    const seriesMap: Record<string, { date: string; pct: number }[]> = {};
    let maxLen = 0;

    selectedTickers.forEach((ticker, i) => {
      const raw = chartQueries[i]?.data;
      if (!Array.isArray(raw) || raw.length < 2) return;
      const startPrice = raw[0].c;
      seriesMap[ticker] = raw.map((d: any) => ({
        date: new Date(d.t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: timeRange === "3Y" || timeRange === "5Y" ? "2-digit" : undefined }),
        pct: ((d.c - startPrice) / startPrice) * 100,
      }));
      if (seriesMap[ticker].length > maxLen) maxLen = seriesMap[ticker].length;
    });

    if (maxLen === 0) return [];

    // Build unified chart data array using the longest series' dates
    const baseTicker = selectedTickers.find((t) => seriesMap[t]?.length === maxLen);
    if (!baseTicker || !seriesMap[baseTicker]) return [];

    return seriesMap[baseTicker].map((point, idx) => {
      const row: Record<string, any> = { date: point.date };
      selectedTickers.forEach((ticker) => {
        const series = seriesMap[ticker];
        if (series && idx < series.length) {
          row[ticker] = Math.round(series[idx].pct * 100) / 100;
        }
      });
      return row;
    });
  }, [selectedTickers, chartQueries.map((q) => q.dataUpdatedAt).join(","), timeRange]);

  const addTicker = (symbol: string) => {
    if (!selectedTickers.includes(symbol) && selectedTickers.length < 6) {
      setSelectedTickers((prev) => [...prev, symbol]);
    }
    setSearchValue("");
    setShowResults(false);
  };

  const removeTicker = (symbol: string) => {
    setSelectedTickers((prev) => prev.filter((t) => t !== symbol));
  };

  const stockData = selectedTickers.map((t) => etfMap[t]).filter(Boolean);

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/etf/screener" className="text-[0.8125rem]">ETFs</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Compare</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[1.375rem] font-bold text-foreground">Compare ETFs</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate("/pro")}>
            Full Width <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Search + selected badges */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-[600px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for an ETF to compare…"
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              className="pl-9 h-10"
            />
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((s) => (
                  <button key={s} onClick={() => addTicker(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between">
                    <span className="font-semibold text-primary">{s}</span>
                    <span className="text-muted-foreground truncate ml-2">{etfMap[s]?.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedTickers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedTickers.map((t, i) => (
              <Badge key={t} variant="outline" className="gap-1.5 px-3 py-1 text-sm" style={{ borderColor: CHART_COLORS[i % CHART_COLORS.length] }}>
                <span style={{ color: CHART_COLORS[i % CHART_COLORS.length] }} className="font-semibold">{t}</span>
                <span className="text-muted-foreground text-xs">{etfMap[t]?.name}</span>
                <button onClick={() => removeTicker(t)} className="ml-1">
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Time range selector */}
        {selectedTickers.length > 0 && (
          <div className="flex gap-1 mb-3">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-full transition-colors",
                  timeRange === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Chart */}
        <div className="border border-border rounded-[var(--radius)] min-h-[360px] flex items-center justify-center mb-8">
          {selectedTickers.length === 0 ? (
            <p className="text-muted-foreground text-base">Add a symbol to get started</p>
          ) : chartLoading ? (
            <Skeleton className="w-full h-[350px] m-4" />
          ) : chartData.length > 0 ? (
            <div className="w-full h-[360px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                    formatter={(v: number, name: string) => [
                      `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
                      name,
                    ]}
                  />
                  <Legend />
                  {selectedTickers.map((t, i) => (
                    <Line
                      key={t}
                      type="monotone"
                      dataKey={t}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No chart data available for the selected period</p>
          )}
        </div>

        {/* Metrics table */}
        {stockData.length > 0 && (
          <div className="overflow-x-auto mb-8">
            <h2 className="text-[1rem] font-bold text-foreground mb-3">Key Metrics</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-border bg-muted/30">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Metric</th>
                  {stockData.map((s, i) => (
                    <th key={s.symbol} className="text-right py-2 px-3 text-xs font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                      {s.symbol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Price", fmt: (s: EtfData) => s.price != null ? `$${Number(s.price).toFixed(2)}` : "—" },
                  { label: "% Change", fmt: (s: EtfData) => {
                    const v = s.change_percent != null ? Number(s.change_percent) : null;
                    return v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—";
                  }},
                  { label: "AUM", fmt: (s: EtfData) => abbr(s.total_assets) },
                  { label: "Expense Ratio", fmt: (s: EtfData) => s.expense_ratio != null ? `${Number(s.expense_ratio).toFixed(2)}%` : "—" },
                  { label: "YTD Return", fmt: (s: EtfData) => s.ytd_return != null ? `${Number(s.ytd_return).toFixed(2)}%` : "—" },
                  { label: "Volume", fmt: (s: EtfData) => s.volume != null ? Number(s.volume).toLocaleString() : "—" },
                  { label: "Holdings", fmt: (s: EtfData) => s.holdings != null ? s.holdings.toLocaleString() : "—" },
                ].map((row, idx) => (
                  <tr key={row.label} className={cn("border-b border-border", idx % 2 === 0 && "bg-muted/20")}>
                    <td className="py-2 px-3 text-[0.8125rem] text-muted-foreground">{row.label}</td>
                    {stockData.map((s) => (
                      <td key={s.symbol} className="py-2 px-3 text-right text-[0.8125rem] font-medium text-foreground tabular-nums">
                        {row.fmt(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Popular comparisons */}
        <div className="mb-8">
          <h2 className="text-[1rem] font-bold text-foreground mb-4">Popular ETF Comparisons</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {POPULAR_COMPARISONS.map(([a, b]) => (
              <button
                key={`${a}-${b}`}
                onClick={() => { setSelectedTickers([a, b]); setTimeRange("1Y"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="border border-border rounded-[var(--radius)] px-4 py-2.5 text-[0.875rem] text-primary font-medium hover:border-primary/50 transition-colors text-center"
              >
                {a} vs. {b}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </div>
  );
}
