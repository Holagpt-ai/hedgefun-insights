import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { getTickerSnapshot, getTickerDetails, getTickerNews, getAggregates } from "@/lib/polygon";
import { slugToTicker } from "@/lib/ticker-utils";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const TABS = ["Overview", "Financials", "Statistics", "Forecast", "Chart", "News", "Dividends", "Splits"];
const TIME_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];

function getDateRange(range: string): { from: string; to: string; multiplier: number; timespan: string } {
  const to = new Date();
  const toStr = to.toISOString().split("T")[0];
  const d = new Date(to);
  switch (range) {
    case "1D": d.setDate(d.getDate() - 1); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 5, timespan: "minute" };
    case "5D": d.setDate(d.getDate() - 5); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 15, timespan: "minute" };
    case "1M": d.setMonth(d.getMonth() - 1); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "day" };
    case "6M": d.setMonth(d.getMonth() - 6); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "day" };
    case "YTD": return { from: `${to.getFullYear()}-01-01`, to: toStr, multiplier: 1, timespan: "day" };
    case "1Y": d.setFullYear(d.getFullYear() - 1); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "day" };
    case "5Y": d.setFullYear(d.getFullYear() - 5); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "week" };
    case "MAX": return { from: "2000-01-01", to: toStr, multiplier: 1, timespan: "month" };
    default: d.setMonth(d.getMonth() - 1); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "day" };
  }
}

const StockDetail = () => {
  const { ticker: slug } = useParams<{ ticker: string }>();
  const ticker = slugToTicker(slug ?? "");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Overview");
  const [timeRange, setTimeRange] = useState("1M");

  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ["snapshot", ticker],
    queryFn: () => getTickerSnapshot(ticker),
    enabled: !!ticker,
  });

  const { data: details } = useQuery({
    queryKey: ["details", ticker],
    queryFn: () => getTickerDetails(ticker),
    enabled: !!ticker,
  });

  const { data: news } = useQuery({
    queryKey: ["ticker-news", ticker],
    queryFn: () => getTickerNews(ticker, 5),
    enabled: !!ticker,
  });

  const dateRange = getDateRange(timeRange);
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["aggregates", ticker, timeRange],
    queryFn: () => getAggregates(ticker, dateRange.multiplier, dateRange.timespan, dateRange.from, dateRange.to),
    enabled: !!ticker,
  });

  const price = snapshot?.day?.c ?? snapshot?.lastTrade?.p ?? 0;
  const change = snapshot?.todaysChange ?? 0;
  const changePct = snapshot?.todaysChangePerc ?? 0;
  const positive = change >= 0;

  const companyName = details?.name ?? ticker;
  const exchange = details?.primary_exchange ?? snapshot?.exchange ?? "";

  const stats = [
    { label: "Market Cap", value: details?.market_cap ? `$${(details.market_cap / 1e9).toFixed(1)}B` : "—" },
    { label: "P/E Ratio", value: details?.pe_ratio?.toFixed(1) ?? "—" },
    { label: "EPS", value: details?.eps?.toFixed(2) ?? "—" },
    { label: "Revenue", value: details?.revenue ? `$${(details.revenue / 1e9).toFixed(1)}B` : "—" },
    { label: "Volume", value: snapshot?.day?.v?.toLocaleString() ?? "—" },
    { label: "52W High", value: snapshot?.week52High?.toFixed(2) ?? "—" },
    { label: "52W Low", value: snapshot?.week52Low?.toFixed(2) ?? "—" },
    { label: "Beta", value: details?.beta?.toFixed(2) ?? "—" },
  ];

  const chartPoints = (chartData ?? []).map((d: any) => ({
    t: d.t,
    price: d.c,
  }));

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        {snapLoading ? (
          <Skeleton className="h-12 w-64" />
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{companyName}</h1>
              <span className="ticker-symbol text-accent-blue text-sm">({ticker})</span>
              {exchange && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{exchange}</span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-foreground tabular-nums">${price.toFixed(2)}</span>
              <span className={cn("text-sm font-medium tabular-nums", positive ? "price-positive" : "price-negative")}>
                {positive ? "+" : ""}{change.toFixed(2)} ({positive ? "+" : ""}{changePct.toFixed(2)}%)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">Powered by Polygon.io</span>
          </>
        )}
      </div>

      {/* Tab Bar */}
      <div className="border-b-2 border-border sticky top-header z-10 bg-surface-card px-4 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-2.5 text-sm font-medium transition-colors relative",
                activeTab === tab
                  ? "text-accent-blue"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <div className="px-4 py-4 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="fintech-card px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-sm font-semibold text-foreground tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="fintech-card p-4">
            <div className="flex gap-1 mb-3 flex-wrap">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full transition-colors",
                    timeRange === r
                      ? "bg-accent-blue text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="h-[280px]">
              {chartLoading ? (
                <Skeleton className="h-full w-full" />
              ) : chartPoints.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartPoints}>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={["auto", "auto"]} hide />
                    <Tooltip
                      formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
                      labelFormatter={() => ""}
                      contentStyle={{
                        background: "hsl(var(--surface-card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                        fontSize: "0.75rem",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={positive ? "hsl(var(--green))" : "hsl(var(--red))"}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No chart data available
                </div>
              )}
            </div>
          </div>

          {/* News */}
          {(news ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2">Recent News</h3>
              <div className="space-y-2">
                {(news ?? []).slice(0, 5).map((n: any, i: number) => (
                  <a
                    key={i}
                    href={n.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-accent-blue hover:underline"
                  >
                    {n.title}
                    <span className="text-xs text-muted-foreground ml-2">— {n.publisher?.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab !== "Overview" && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{activeTab} tab — coming soon.</p>
        </div>
      )}
    </div>
  );
};

export default StockDetail;
