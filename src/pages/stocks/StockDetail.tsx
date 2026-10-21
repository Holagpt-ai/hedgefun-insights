import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { slugToTicker } from "@/lib/ticker-utils";
import { usePageSeo } from "@/hooks/usePageSeo";
import { generateMetaTitle, generateMetaDescription } from "@/lib/agentic-seo";
import { getTickerSnapshot, getTickerDetails, getTickerNews, getAggregates, getDividends, getSplits } from "@/lib/polygon";
import { fetchChartAggregateBars } from "@/lib/stock-chart/fetch-aggregates";
import { normalizeAggregateBars, toOhlcvSeries, chartSeriesMeta } from "@/lib/stock-chart/normalize-bars";
import { resolveChartAggregateRequest } from "@/lib/stock-chart/chart-ranges";
import { cn } from "@/lib/utils";
import StockHeader from "@/components/stock/StockHeader";
import StockStatsTable from "@/components/stock/StockStatsTable";
import TradingViewChart from "@/components/charts/TradingViewChart";
import type { OHLCVData } from "@/components/charts/TradingViewChart";

import StockAbout from "@/components/stock/StockAbout";
import StockNews from "@/components/stock/StockNews";
import StockFinancialsTab from "@/components/stock/StockFinancialsTab";
import StockStatisticsTab from "@/components/stock/StockStatisticsTab";
import StockForecastTab from "@/components/stock/StockForecastTab";
import StockDividendsTab from "@/components/stock/StockDividendsTab";
import StockSplitsTab from "@/components/stock/StockSplitsTab";
import { AdBanner } from "@/components/layout/AdBanner";
import { StockPublicIntelligence } from "@/components/stock/StockPublicIntelligence";
import { StockHistoricalRadarLink } from "@/components/stock/StockHistoricalRadarLink";
import { buildStockDetailJsonLd, stockDetailCanonicalPath } from "@/lib/seo/stock-json-ld";
import { trackPublicStockResearch } from "@/lib/analytics/public-events";

const TABS = ["Overview", "Financials", "Statistics", "Forecast", "Chart", "News", "Dividends", "Splits"];

const StockDetail = () => {
  const { ticker: slug } = useParams<{ ticker: string }>();
  const ticker = slugToTicker(slug ?? "");
  const [activeTab, setActiveTab] = useState("Overview");
  const [timeRange, setTimeRange] = useState("1M");

  const companyName = undefined as string | undefined; // populated after details fetch below


  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ["snapshot", ticker],
    queryFn: () => getTickerSnapshot(ticker),
    enabled: !!ticker,
    retry: 1,
  });

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["details", ticker],
    queryFn: () => getTickerDetails(ticker),
    enabled: !!ticker,
    retry: 1,
  });

  usePageSeo({
    title: generateMetaTitle(ticker, details?.name),
    description: generateMetaDescription(ticker, details?.name),
    canonical: stockDetailCanonicalPath(ticker),
    jsonLd: ticker
      ? buildStockDetailJsonLd({
        symbol: ticker,
        name: details?.name,
        exchange: details?.primary_exchange ?? undefined,
      })
      : undefined,
  });

  useEffect(() => {
    if (!ticker) return;
    trackPublicStockResearch({ symbol: ticker, source: "stock_detail" });
  }, [ticker]);

  const { data: news } = useQuery({
    queryKey: ["ticker-news", ticker],
    queryFn: () => getTickerNews(ticker, 10),
    enabled: !!ticker,
    retry: 1,
  });

  const { data: dividends, isLoading: dividendsLoading } = useQuery({
    queryKey: ["dividends", ticker],
    queryFn: () => getDividends(ticker, 20),
    enabled: !!ticker,
    retry: 1,
  });

  const { data: splits, isLoading: splitsLoading } = useQuery({
    queryKey: ["splits", ticker],
    queryFn: () => getSplits(ticker, 20),
    enabled: !!ticker,
    retry: 1,
  });

  const yearRange = resolveChartAggregateRequest("1Y");
  const { data: yearAggsRaw } = useQuery({
    queryKey: ["year-aggs", ticker],
    queryFn: async () => {
      const payload = await getAggregates(ticker, yearRange.multiplier, yearRange.timespan, yearRange.from, yearRange.to);
      return normalizeAggregateBars(
        Array.isArray(payload) ? payload : (payload as { results?: unknown[] })?.results ?? payload,
      );
    },
    enabled: !!ticker,
    retry: 1,
  });

  const { data: chartBundle, isLoading: chartLoading } = useQuery({
    queryKey: ["chart-aggregates", ticker, timeRange],
    queryFn: () => fetchChartAggregateBars(ticker, timeRange),
    enabled: !!ticker,
    retry: 1,
  });

  const yearAggs = yearAggsRaw ?? [];

  const positive = (snapshot?.todaysChangePerc ?? 0) >= 0;
  const prevClose = snapshot?.prevDay?.c ?? null;
  const currentPrice = snapshot?.day?.c ?? snapshot?.prevDay?.c ?? null;

  const chartMeta = chartBundle
    ? chartSeriesMeta(chartBundle.bars, chartBundle.request.granularity, chartBundle.usesPriorSessionFallback)
    : null;

  const ohlcvData: OHLCVData[] = chartBundle
    ? toOhlcvSeries(chartBundle.bars, chartBundle.request.granularity)
    : [];

  const ohlcvYearData: OHLCVData[] = toOhlcvSeries(yearAggs, "daily");

  const isPreIPO = (
    (!snapshot || (snapshot?.day?.c === 0 && snapshot?.day?.v === 0)) &&
    (!details?.list_date || new Date(details.list_date) > new Date())
  );

  return (
    <div className="flex flex-col">
      <StockHeader snapshot={snapshot} details={details} loading={snapLoading || detailsLoading} ticker={ticker} isPreIPO={isPreIPO} />

      <div className="border-b-2 border-border sticky top-header z-10 bg-surface-card px-4 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-2.5 text-sm font-medium transition-colors relative",
                activeTab === tab ? "text-accent-blue" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue" />}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Overview" && (
        <div className="px-4 py-4 space-y-6">
          <StockPublicIntelligence
            ticker={ticker}
            observationMs={null}
            observationLabel={null}
          />
          <StockHistoricalRadarLink ticker={ticker} />
          {/* Two-column layout: stats left, chart right */}
          <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-6 items-start">
            {/* Left: Stats Table */}
            <div>
              <StockStatsTable snapshot={snapshot} details={details} dividends={dividends} yearAggs={yearAggs} loading={snapLoading || detailsLoading} />
            </div>
            {/* Right: Time range + Chart + CTA buttons */}
            <div className="flex flex-col gap-3">
              {/* Time range selector */}
              <div className="flex items-center gap-1 flex-wrap">
                {["1D","5D","1M","3M","6M","YTD","1Y","5Y","MAX"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
                      timeRange === r
                        ? "bg-accent-blue text-white border-accent-blue"
                        : "border-border text-muted-foreground hover:border-accent-blue hover:text-accent-blue"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {/* Chart */}
              {chartMeta?.lastObservedAt && (
                <p className="text-[0.6875rem] text-muted-foreground">
                  Chart data as of {new Date(chartMeta.lastObservedAt).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}
                  {chartMeta.usesPriorSessionFallback ? " · Prior regular session" : ""}
                </p>
              )}
              <TradingViewChart
                data={ohlcvData}
                ticker={ticker}
                companyName={details?.name}
                isPositive={positive}
                height={320}
                loading={chartLoading}
                hideToolbar={true}
              />
            </div>
          </div>
          {/* Full-width sections below */}
          <StockAbout details={details} ticker={ticker} />
          <StockNews news={news} />
        </div>
      )}

      {activeTab === "Financials" && (
        <div className="px-4 py-4">
          <StockFinancialsTab />
        </div>
      )}

      {activeTab === "Statistics" && (
        <div className="px-4 py-4">
          <StockStatisticsTab />
        </div>
      )}

      {activeTab === "Forecast" && (
        <div className="px-4 py-4">
          <StockForecastTab />
        </div>
      )}

      {activeTab === "Chart" && (
        <div className="px-4 py-4 space-y-6">
          <div className="flex items-center gap-1 flex-wrap">
            {["1D","5D","1M","3M","6M","YTD","1Y","5Y","MAX"].map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded border transition-colors",
                  timeRange === r
                    ? "bg-accent-blue text-white border-accent-blue"
                    : "border-border text-muted-foreground hover:border-accent-blue hover:text-accent-blue"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <TradingViewChart data={ohlcvData} ticker={ticker} companyName={details?.name} isPositive={positive} height={480} loading={chartLoading} />
        </div>
      )}

      {activeTab === "News" && (
        <div className="px-4 py-4">
          <StockNews news={news} />
        </div>
      )}

      {activeTab === "Dividends" && (
        <div className="px-4 py-4">
          <StockDividendsTab dividends={dividends} loading={dividendsLoading} ticker={ticker} currentPrice={currentPrice} />
        </div>
      )}

      {activeTab === "Splits" && (
        <div className="px-4 py-4">
          <StockSplitsTab splits={splits} loading={splitsLoading} ticker={ticker} />
        </div>
      )}
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </div>
  );
};

export default StockDetail;
