import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { slugToTicker } from "@/lib/ticker-utils";
import { getTickerSnapshot, getTickerDetails, getTickerNews, getAggregates, getDividends, getSplits } from "@/lib/polygon";
import { cn } from "@/lib/utils";
import StockHeader from "@/components/stock/StockHeader";
import StockStatsTable from "@/components/stock/StockStatsTable";
import TradingViewChart from "@/components/charts/TradingViewChart";
import type { OHLCVData } from "@/components/charts/TradingViewChart";
import StockCtaButtons from "@/components/stock/StockCtaButtons";
import StockAbout from "@/components/stock/StockAbout";
import StockNews from "@/components/stock/StockNews";
import StockFinancialsTab from "@/components/stock/StockFinancialsTab";
import StockStatisticsTab from "@/components/stock/StockStatisticsTab";
import StockForecastTab from "@/components/stock/StockForecastTab";
import StockDividendsTab from "@/components/stock/StockDividendsTab";
import StockSplitsTab from "@/components/stock/StockSplitsTab";
import { AdBanner } from "@/components/layout/AdBanner";

const TABS = ["Overview", "Financials", "Statistics", "Forecast", "Chart", "News", "Dividends", "Splits"];

function getDateRange(range: string) {
  const to = new Date();
  const toStr = to.toISOString().split("T")[0];
  const d = new Date(to);
  switch (range) {
    case "1D": d.setDate(d.getDate() - 1); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "minute" };
    case "5D": d.setDate(d.getDate() - 5); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 5, timespan: "minute" };
    case "1M": d.setMonth(d.getMonth() - 1); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "day" };
    case "3M": d.setMonth(d.getMonth() - 3); return { from: d.toISOString().split("T")[0], to: toStr, multiplier: 1, timespan: "day" };
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
  const [activeTab, setActiveTab] = useState("Overview");
  const [timeRange, setTimeRange] = useState("1M");

  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ["snapshot", ticker],
    queryFn: () => getTickerSnapshot(ticker),
    enabled: !!ticker,
    retry: 3, retryDelay: 2000,
  });

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["details", ticker],
    queryFn: () => getTickerDetails(ticker),
    enabled: !!ticker,
    retry: 3, retryDelay: 2000,
  });

  const { data: news } = useQuery({
    queryKey: ["ticker-news", ticker],
    queryFn: () => getTickerNews(ticker, 10),
    enabled: !!ticker,
    retry: 3, retryDelay: 2000,
  });

  const { data: dividends, isLoading: dividendsLoading } = useQuery({
    queryKey: ["dividends", ticker],
    queryFn: () => getDividends(ticker, 20),
    enabled: !!ticker,
    retry: 3, retryDelay: 2000,
  });

  const { data: splits, isLoading: splitsLoading } = useQuery({
    queryKey: ["splits", ticker],
    queryFn: () => getSplits(ticker, 20),
    enabled: !!ticker,
    retry: 3, retryDelay: 2000,
  });

  const yearRange = getDateRange("1Y");
  const { data: yearAggs } = useQuery({
    queryKey: ["year-aggs", ticker],
    queryFn: () => getAggregates(ticker, 1, "day", yearRange.from, yearRange.to),
    enabled: !!ticker,
    retry: 3, retryDelay: 2000,
  });

  const dateRange = getDateRange(timeRange);
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["aggregates", ticker, timeRange],
    queryFn: () => getAggregates(ticker, dateRange.multiplier, dateRange.timespan, dateRange.from, dateRange.to),
    enabled: !!ticker,
    retry: 3, retryDelay: 2000,
  });

  const positive = (snapshot?.todaysChangePerc ?? 0) >= 0;
  const prevClose = snapshot?.prevDay?.c ?? null;
  const currentPrice = snapshot?.day?.c ?? snapshot?.prevDay?.c ?? null;

  const ohlcvData: OHLCVData[] = (chartData ?? []).map((d: any) => ({
    time: new Date(d.t).toISOString().split('T')[0],
    open: d.o,
    high: d.h,
    low: d.l,
    close: d.c,
    volume: d.v,
  }));

  const isPreIPO = (
    (!snapshot || (snapshot?.day?.c === 0 && snapshot?.day?.v === 0)) &&
    (!details?.list_date || new Date(details.list_date) > new Date())
  );

  return (
    <div className="flex flex-col">
      <StockHeader snapshot={snapshot} details={details} loading={snapLoading} ticker={ticker} isPreIPO={isPreIPO} />

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
          <StockStatsTable snapshot={snapshot} details={details} dividends={dividends} yearAggs={yearAggs} loading={snapLoading || detailsLoading} />
          <TradingViewChart data={ohlcvData} ticker={ticker} isPositive={positive} height={380} loading={chartLoading} />
          <StockCtaButtons ticker={ticker} />
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
          <TradingViewChart data={ohlcvData} ticker={ticker} isPositive={positive} height={480} loading={chartLoading} />
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
