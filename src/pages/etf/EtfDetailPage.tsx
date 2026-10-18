import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getTickerNews, getTickerSnapshot, getTickerDetails } from "@/lib/polygon";
import { usePageSeo } from "@/hooks/usePageSeo";
import TradingViewChart from "@/components/charts/TradingViewChart";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdBanner } from "@/components/layout/AdBanner";
import { EtfSectorBreakdown } from "@/components/etf/EtfSectorBreakdown";
import { EtfFundOverview } from "@/components/etf/EtfFundOverview";
import { EtfPerformanceChart } from "@/components/etf/EtfPerformanceChart";
import { EtfHoldingsSection } from "@/components/etf/EtfHoldingsSection";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchChartAggregateBars } from "@/lib/stock-chart/fetch-aggregates";
import { chartSeriesMeta, toOhlcvSeries } from "@/lib/stock-chart/normalize-bars";
import { formatChartDataDisclosure } from "@/lib/stock-chart/chart-disclosure";
import { descriptiveProfile, RELATED_ETF_LINKS } from "@/lib/etf/descriptive-profile";
import { buildEtfStatGrid, buildFundDetailRows } from "@/lib/etf/fund-metrics";
import { presentEtfHoldings } from "@/lib/etf/holdings-evidence";
import { buildEtfPerformance, loadEtfDailyBars } from "@/lib/etf/price-performance";
import { etfResearchQueryKeys } from "@/lib/etf/query-keys";
import { presentEtfQuote } from "@/lib/etf/quote-state";
import { presentSectorExposure } from "@/lib/etf/sector-exposure";

const TIME_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;

const EXCHANGE_MAP: Record<string, string> = {
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  XASE: "NYSE American",
  ARCX: "NYSE Arca",
  BATS: "CBOE BZX",
};

type EtfRow = Database["public"]["Tables"]["etfs"]["Row"];

export default function EtfDetailPage() {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const symbol = (rawSymbol ?? "").toUpperCase();
  const profile = descriptiveProfile(symbol);
  const [timeRange, setTimeRange] = useState<string>("1Y");
  const keys = etfResearchQueryKeys(symbol, timeRange);

  const { data: etfRow, isPending: etfPending, isError: etfError, isSuccess: etfSuccess } = useQuery({
    queryKey: keys.row,
    queryFn: async (): Promise<EtfRow | null> => {
      const { data, error } = await supabase.from("etfs").select("*").eq("symbol", symbol).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: symbol.length > 0,
    retry: false,
  });

  const { data: snapshot, isPending: snapshotPending, isError: snapshotError } = useQuery({
    queryKey: keys.snapshot,
    queryFn: () => getTickerSnapshot(symbol),
    enabled: symbol.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const { data: etfDetails, isError: detailsError } = useQuery({
    queryKey: keys.details,
    queryFn: () => getTickerDetails(symbol),
    enabled: symbol.length > 0,
    staleTime: 300_000,
    retry: false,
  });

  const { data: chartBundle, isPending: chartPending, isError: chartError } = useQuery({
    queryKey: keys.chart,
    queryFn: () => fetchChartAggregateBars(symbol, timeRange),
    enabled: symbol.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const { data: historyBars, isPending: historyPending, isError: historyError, isSuccess: historySuccess } = useQuery({
    queryKey: keys.history,
    queryFn: () => loadEtfDailyBars(symbol),
    enabled: symbol.length > 0,
    staleTime: 300_000,
    retry: false,
  });

  const { data: newsItems, isError: newsError } = useQuery({
    queryKey: keys.news,
    queryFn: () => getTickerNews(symbol, 5),
    enabled: symbol.length > 0,
    staleTime: 120_000,
    retry: false,
  });

  const displayName = etfRow?.name || etfDetails?.name || profile?.name || symbol;
  const exchangeCode = typeof etfDetails?.primary_exchange === "string" ? etfDetails.primary_exchange : "";
  const exchange = EXCHANGE_MAP[exchangeCode] || profile?.exchange || null;

  usePageSeo({
    title: `${symbol} ETF — ${displayName} Price & Holdings | Stocksist`,
    description: `Get the latest ${symbol} ETF price, performance, holdings, sector breakdown, and news on Stocksist.`,
    canonical: `https://stocksist.com/etf/${symbol.toLowerCase()}`,
  });

  const quote = presentEtfQuote({
    snapshotStatus: snapshotPending ? "pending" : snapshotError ? (etfPending ? "pending" : "error") : "success",
    snapshot,
    databasePrice: etfSuccess ? etfRow?.price ?? null : null,
    databaseUpdatedAt: etfSuccess ? etfRow?.updated_at ?? null : null,
  });

  const ohlcvData = useMemo(
    () => (chartBundle ? toOhlcvSeries(chartBundle.bars, chartBundle.request.granularity) : []),
    [chartBundle],
  );
  const chartMeta = chartBundle
    ? chartSeriesMeta(chartBundle.bars, chartBundle.request.granularity, chartBundle.usesPriorSessionFallback)
    : null;
  const chartDisclosure = formatChartDataDisclosure(chartMeta);
  const chartUnavailable = !chartPending && (chartError || ohlcvData.length === 0);

  const performance = useMemo(
    () => (historySuccess ? buildEtfPerformance(historyBars ?? [], null) : null),
    [historyBars, historySuccess],
  );

  const stats = useMemo(
    () => buildEtfStatGrid({
      record: etfSuccess ? etfRow ?? null : null,
      snapshot,
      history: historySuccess ? historyBars ?? [] : null,
      listDate: typeof etfDetails?.list_date === "string" ? etfDetails.list_date : null,
    }),
    [etfDetails?.list_date, etfRow, etfSuccess, historyBars, historySuccess, snapshot],
  );

  const fundDetails = useMemo(
    () => buildFundDetailRows({
      symbol,
      record: etfSuccess ? etfRow ?? null : null,
      providerDescription: typeof etfDetails?.description === "string" ? etfDetails.description : null,
    }),
    [etfDetails?.description, etfRow, etfSuccess, symbol],
  );

  const holdingsEvidence = useMemo(() => presentEtfHoldings(symbol, null), [symbol]);
  const sectorEvidence = useMemo(() => presentSectorExposure(null), []);
  const related = RELATED_ETF_LINKS[symbol] ?? [];
  const snapshotMove = quote.status === "snapshot" && quote.change !== null && quote.changePercent !== null
    ? { change: quote.change, changePercent: quote.changePercent }
    : null;
  const positive = snapshotMove ? snapshotMove.changePercent >= 0 : true;

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <div className="mb-5" data-testid="etf-quote">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-[1.375rem] font-bold text-foreground">{displayName}</h1>
                <Badge variant="secondary" className="text-xs font-semibold">{symbol}</Badge>
                {exchange && <Badge variant="outline" className="text-xs">{exchange}</Badge>}
              </div>
              {quote.status === "loading" ? (
                <Skeleton className="h-10 w-48" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-[2rem] font-bold text-foreground tabular-nums">
                    {quote.status === "snapshot" || quote.status === "database_fallback"
                      ? `$${quote.price.toFixed(2)}`
                      : "—"}
                  </span>
                  {snapshotMove && (
                    <>
                      <span className={cn("text-sm font-semibold tabular-nums", positive ? "text-green" : "text-red")}>
                        {positive ? "+" : ""}{snapshotMove.change.toFixed(2)}
                      </span>
                      <span className={cn("text-sm font-semibold tabular-nums", positive ? "text-green" : "text-red")}>
                        ({positive ? "+" : ""}{snapshotMove.changePercent.toFixed(2)}%)
                      </span>
                    </>
                  )}
                </div>
              )}
              {quote.status === "snapshot" && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">
                    {quote.sessionLine}
                    {quote.sourceLabel ? ` · ${quote.sourceLabel}` : ""}
                  </p>
                  {quote.sessionContext && (
                    <p className="text-xs text-muted-foreground mt-1">{quote.sessionContext}</p>
                  )}
                  {quote.priorSession && (
                    <p className="text-xs text-muted-foreground mt-1">Previous session price</p>
                  )}
                  {quote.observationLine && (
                    <p className="text-xs text-muted-foreground mt-1">{quote.observationLine}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{quote.delayDisclosure}</p>
                </>
              )}
              {quote.status === "database_fallback" && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">{quote.detail}</p>
                  <p className="text-xs text-muted-foreground mt-1">{quote.delayDisclosure}</p>
                </>
              )}
              {(quote.status === "error" || quote.status === "unavailable") && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">{quote.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{quote.delayDisclosure}</p>
                </>
              )}
              <p className="text-xs text-muted-foreground mt-1">Powered by Massive</p>
              {etfError && (
                <p className="text-xs text-muted-foreground mt-1">Fund record unavailable</p>
              )}
              {detailsError && (
                <p className="text-xs text-muted-foreground mt-1">Provider reference details unavailable</p>
              )}
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-1 flex-wrap mb-2">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setTimeRange(range)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
                      timeRange === range
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {range}
                  </button>
                ))}
              </div>
              {chartDisclosure && (
                <p className="text-xs text-muted-foreground mb-2" data-testid="etf-chart-disclosure">{chartDisclosure}</p>
              )}
              {chartUnavailable && (
                <p className="text-sm text-muted-foreground mb-2">Historical chart data unavailable</p>
              )}
              <TradingViewChart
                data={ohlcvData}
                ticker={symbol}
                companyName={displayName}
                isPositive={positive}
                height={380}
                loading={chartPending}
              />
            </div>

            {etfPending || historyPending ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="etf-stats">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="etf-stats">
                {stats.map((stat) => (
                  <div key={stat.label} className="border border-border rounded-[var(--radius)] px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className={cn(
                      "text-sm font-semibold tabular-nums",
                      stat.tone === "up" && "text-green-600 dark:text-green-400",
                      stat.tone === "down" && "text-red-600 dark:text-red-400",
                      !stat.tone && "text-foreground",
                    )}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {!historyPending && (
              <p className="text-xs text-muted-foreground -mt-4 mb-6">
                52-week high/low and YTD use daily price history. They are not dividend-adjusted total returns.
              </p>
            )}

            <EtfPerformanceChart
              symbol={symbol}
              status={historyPending ? "loading" : historyError ? "error" : "ready"}
              model={performance}
            />

            <EtfHoldingsSection evidence={holdingsEvidence} />
            <EtfSectorBreakdown evidence={sectorEvidence} />
            <EtfFundOverview
              description={fundDetails.description}
              descriptionKind={fundDetails.descriptionKind}
              rows={fundDetails.rows}
            />

            <div className="mb-6">
              <h2 className="text-[1rem] font-bold text-foreground mb-3">Recent News</h2>
              {newsError ? (
                <p className="text-sm text-muted-foreground">News unavailable</p>
              ) : Array.isArray(newsItems) && newsItems.length > 0 ? (
                <div className="space-y-3">
                  {newsItems.slice(0, 5).map((item: {
                    article_url?: string;
                    image_url?: string;
                    title?: string;
                    publisher?: { name?: string };
                    source?: string;
                    published_utc?: string;
                  }, index: number) => (
                    <a key={item.article_url ?? index} href={item.article_url} target="_blank" rel="noopener noreferrer" className="flex gap-3 group">
                      {item.image_url && (
                        <img src={item.image_url} alt="" width={80} height={56} className="w-20 h-14 rounded object-cover flex-shrink-0" loading="lazy" style={{ backgroundColor: "#f4f4f5" }} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.8125rem] font-semibold text-foreground group-hover:text-primary line-clamp-2">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.publisher?.name ?? item.source} · {item.published_utc ? new Date(item.published_utc).toLocaleDateString() : ""}
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

          <aside className="hidden lg:flex flex-col gap-4 w-[280px] shrink-0" data-testid="etf-sidebar">
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Stocksist Pro</h3>
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
                {related.map((ticker) => (
                  <Link key={ticker} to={`/etf/${ticker.toLowerCase()}`} className="flex items-center justify-between text-[0.8125rem] text-primary font-semibold hover:underline">
                    {descriptiveProfile(ticker)?.name ?? ticker} ({ticker})
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
