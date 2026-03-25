import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAggregates, getTickerNews } from "@/lib/polygon";
import { usePageSeo } from "@/hooks/usePageSeo";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdBanner } from "@/components/layout/AdBanner";
import { EtfSectorBreakdown } from "@/components/etf/EtfSectorBreakdown";
import { EtfFundOverview } from "@/components/etf/EtfFundOverview";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const TIME_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;

function getDateRange(range: string) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from: string;
  let multiplier = 1;
  let timespan = "day";

  switch (range) {
    case "1D": multiplier = 5; timespan = "minute"; from = to; break;
    case "5D": from = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10); timespan = "hour"; break;
    case "1M": from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10); break;
    case "6M": from = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10); break;
    case "YTD": from = `${now.getFullYear()}-01-01`; break;
    case "1Y": from = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10); break;
    case "5Y": from = new Date(now.getTime() - 5 * 365 * 86400000).toISOString().slice(0, 10); timespan = "week"; break;
    case "MAX": from = "2000-01-01"; timespan = "month"; break;
    default: from = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  }
  return { from, to, multiplier, timespan };
}

const ETF_META: Record<string, { name: string; exchange: string }> = {
  SPY: { name: "SPDR S&P 500 ETF Trust", exchange: "NYSE Arca" },
  QQQ: { name: "Invesco QQQ Trust", exchange: "NASDAQ" },
  DIA: { name: "SPDR Dow Jones Industrial Average ETF", exchange: "NYSE Arca" },
  IWM: { name: "iShares Russell 2000 ETF", exchange: "NYSE Arca" },
};

const HOLDINGS: Record<string, { symbol: string; name: string; weight: string }[]> = {
  SPY: [
    { symbol: "AAPL", name: "Apple", weight: "7.12%" },
    { symbol: "MSFT", name: "Microsoft", weight: "6.58%" },
    { symbol: "NVDA", name: "NVIDIA", weight: "6.24%" },
    { symbol: "AMZN", name: "Amazon", weight: "3.82%" },
    { symbol: "META", name: "Meta Platforms", weight: "2.65%" },
    { symbol: "GOOGL", name: "Alphabet (A)", weight: "2.12%" },
    { symbol: "GOOG", name: "Alphabet (C)", weight: "1.76%" },
    { symbol: "BRK.B", name: "Berkshire Hathaway", weight: "1.72%" },
    { symbol: "TSLA", name: "Tesla", weight: "1.64%" },
    { symbol: "LLY", name: "Eli Lilly", weight: "1.60%" },
  ],
  QQQ: [
    { symbol: "AAPL", name: "Apple", weight: "8.91%" },
    { symbol: "MSFT", name: "Microsoft", weight: "8.16%" },
    { symbol: "NVDA", name: "NVIDIA", weight: "7.82%" },
    { symbol: "AMZN", name: "Amazon", weight: "5.42%" },
    { symbol: "META", name: "Meta Platforms", weight: "4.88%" },
    { symbol: "AVGO", name: "Broadcom", weight: "4.12%" },
    { symbol: "GOOGL", name: "Alphabet (A)", weight: "2.72%" },
    { symbol: "GOOG", name: "Alphabet (C)", weight: "2.63%" },
    { symbol: "TSLA", name: "Tesla", weight: "2.56%" },
    { symbol: "COST", name: "Costco", weight: "2.48%" },
  ],
  DIA: [
    { symbol: "UNH", name: "UnitedHealth", weight: "8.94%" },
    { symbol: "GS", name: "Goldman Sachs", weight: "7.52%" },
    { symbol: "MSFT", name: "Microsoft", weight: "6.18%" },
    { symbol: "HD", name: "Home Depot", weight: "5.84%" },
    { symbol: "CAT", name: "Caterpillar", weight: "5.22%" },
    { symbol: "AMGN", name: "Amgen", weight: "4.96%" },
    { symbol: "MCD", name: "McDonald's", weight: "4.72%" },
    { symbol: "V", name: "Visa", weight: "4.08%" },
    { symbol: "CRM", name: "Salesforce", weight: "3.92%" },
    { symbol: "AXP", name: "American Express", weight: "3.68%" },
  ],
  IWM: [
    { symbol: "SMCI", name: "Super Micro Computer", weight: "0.62%" },
    { symbol: "FTNT", name: "Fortinet", weight: "0.48%" },
    { symbol: "EQT", name: "EQT Corporation", weight: "0.42%" },
    { symbol: "RCL", name: "Royal Caribbean", weight: "0.40%" },
    { symbol: "FNF", name: "Fidelity National Financial", weight: "0.38%" },
    { symbol: "TOST", name: "Toast", weight: "0.36%" },
    { symbol: "CW", name: "Curtiss-Wright", weight: "0.34%" },
    { symbol: "IESC", name: "IES Holdings", weight: "0.32%" },
    { symbol: "SF", name: "Stifel Financial", weight: "0.30%" },
    { symbol: "LUMN", name: "Lumen Technologies", weight: "0.28%" },
  ],
};

const RELATED: Record<string, string[]> = {
  SPY: ["QQQ", "DIA", "IWM"],
  QQQ: ["SPY", "DIA", "IWM"],
  DIA: ["SPY", "QQQ", "IWM"],
  IWM: ["SPY", "QQQ", "DIA"],
};

function abbr(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export default function EtfDetailPage() {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const symbol = (rawSymbol ?? "").toUpperCase();
  const meta = ETF_META[symbol] ?? { name: symbol, exchange: "NYSE" };
  const [timeRange, setTimeRange] = useState<string>("1Y");

  usePageSeo({
    title: `${symbol} ETF Stock Price & Overview | HedgeFun`,
    description: `Get the latest ${symbol} ETF price, performance, holdings, and news on HedgeFun.`,
    canonical: `https://hedge-fun-analysis.lovable.app/etf/${symbol.toLowerCase()}`,
  });

  // Fetch ETF row from DB
  const { data: etfRow } = useQuery({
    queryKey: ["etf-detail", symbol],
    queryFn: async () => {
      const { data } = await supabase.from("etfs").select("*").eq("symbol", symbol).maybeSingle();
      return data;
    },
  });

  // Fetch chart data
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange]);
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["etf-chart", symbol, timeRange],
    queryFn: () => getAggregates(symbol, dateRange.multiplier, dateRange.timespan, dateRange.from, dateRange.to),
    staleTime: 60_000,
  });

  // Fetch news
  const { data: newsItems } = useQuery({
    queryKey: ["etf-news", symbol],
    queryFn: () => getTickerNews(symbol, 5),
    staleTime: 120_000,
  });

  const chartPoints = useMemo(() => {
    if (!Array.isArray(chartData)) return [];
    return chartData.map((d: any) => ({
      date: new Date(d.t).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      price: d.c,
    }));
  }, [chartData]);

  const price = etfRow?.price ?? null;
  const changePct = etfRow?.change_percent ?? 0;
  const changeAmt = price && changePct ? (price * changePct / (100 + changePct)) : 0;
  const positive = changePct >= 0;

  const stats = [
    { label: "AUM", value: abbr(etfRow?.total_assets) },
    { label: "Expense Ratio", value: etfRow?.expense_ratio != null ? `${etfRow.expense_ratio.toFixed(2)}%` : "—" },
    { label: "52W High", value: "—" },
    { label: "52W Low", value: "—" },
    { label: "Volume", value: etfRow?.volume ? etfRow.volume.toLocaleString() : "—" },
    { label: "Avg Volume", value: "—" },
    { label: "YTD Return", value: etfRow?.ytd_return != null ? `${etfRow.ytd_return.toFixed(2)}%` : "—" },
    { label: "Inception Date", value: etfRow?.inception_date ?? "—" },
  ];

  const holdings = HOLDINGS[symbol] ?? [];
  const related = RELATED[symbol] ?? [];

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-[1.375rem] font-bold text-foreground">{meta.name}</h1>
                <Badge variant="secondary" className="text-xs font-semibold">{symbol}</Badge>
                <Badge variant="outline" className="text-xs">{meta.exchange}</Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[2rem] font-bold text-foreground tabular-nums">
                  {price != null ? `$${price.toFixed(2)}` : "—"}
                </span>
                {price != null && (
                  <>
                    <span className={cn("text-sm font-semibold tabular-nums", positive ? "text-green" : "text-red")}>
                      {positive ? "+" : ""}{changeAmt.toFixed(2)}
                    </span>
                    <span className={cn("text-sm font-semibold tabular-nums", positive ? "text-green" : "text-red")}>
                      ({positive ? "+" : ""}{changePct.toFixed(2)}%)
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Powered by Massive</p>
            </div>

            {/* Time range selector */}
            <div className="flex gap-1 mb-4">
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

            {/* Price chart */}
            <div className="h-[280px] w-full mb-6 border border-border rounded-[var(--radius)] p-3">
              {chartLoading ? (
                <Skeleton className="h-full w-full" />
              ) : chartPoints.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartPoints}>
                    <defs>
                      <linearGradient id="etfChartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
                    />
                    <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#etfChartFill)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No chart data available</div>
              )}
            </div>

            {/* Key stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {stats.map((s) => (
                <div key={s.label} className="border border-border rounded-[var(--radius)] px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Holdings table */}
            <div className="mb-6">
              <h2 className="text-[1rem] font-bold text-foreground mb-2">Top Holdings <span className="text-xs text-muted-foreground font-normal">(as of last update)</span></h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-border bg-muted/30">
                    <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Symbol</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Company</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">Weight %</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.symbol} className="border-b border-border hover:bg-muted/50">
                      <td className="py-[7px] px-3">
                        <Link to={`/stocks/${h.symbol.toLowerCase()}`} className="text-primary font-semibold text-[0.8125rem] hover:underline">{h.symbol}</Link>
                      </td>
                      <td className="py-[7px] px-3 text-[0.8125rem] text-foreground">{h.name}</td>
                      <td className="py-[7px] px-3 text-right text-[0.8125rem] text-foreground tabular-nums">{h.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>


            {/* Sector breakdown */}
            <EtfSectorBreakdown symbol={symbol} />

            {/* Fund overview & details */}
            <EtfFundOverview symbol={symbol} />

            {/* News section */}
            <div className="mb-6">
              <h2 className="text-[1rem] font-bold text-foreground mb-3">Recent News</h2>
              {Array.isArray(newsItems) && newsItems.length > 0 ? (
                <div className="space-y-3">
                  {newsItems.slice(0, 5).map((n: any, i: number) => (
                    <a key={i} href={n.article_url} target="_blank" rel="noopener noreferrer" className="flex gap-3 group">
                      {n.image_url && (
                        <img src={n.image_url} alt="" className="w-20 h-14 rounded object-cover flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.8125rem] font-semibold text-foreground group-hover:text-primary line-clamp-2">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {n.publisher?.name ?? n.source} · {n.published_utc ? new Date(n.published_utc).toLocaleDateString() : ""}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent news available.</p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col gap-4 w-[280px] shrink-0">
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">HedgeFun Pro</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Upgrade for unlimited access to all data and tools.</p>
              <Button size="sm" className="w-full" onClick={() => navigate("/pro")}>
                Sign Up Today <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Market Newsletter</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Get a daily email with the top market news in bullet point format.</p>
              <div className="flex gap-2">
                <Input placeholder="Enter your email" className="h-8 text-sm flex-1" />
                <Button size="sm">Subscribe</Button>
              </div>
            </div>
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Related ETFs</h3>
              <div className="space-y-2">
                {related.map((r) => (
                  <Link key={r} to={`/etf/${r.toLowerCase()}`} className="flex items-center justify-between text-[0.8125rem] text-primary font-semibold hover:underline">
                    {ETF_META[r]?.name ?? r} ({r})
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            </div>
            <AdBanner />
          </aside>
        </div>
      </div>
    </div>
  );
}
