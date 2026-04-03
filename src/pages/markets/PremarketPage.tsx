import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { resolveCurrentPrice } from "@/lib/price-utils";
import { MoversTable, type MoverRow } from "@/components/markets/MarketMoversLayout";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "@/hooks/use-toast";

const TIME_TABS = ["Today", "Week", "Month", "YTD", "Year", "3 Years", "5 Years"];

function mapRows(tickers: any[]): MoverRow[] {
  if (!Array.isArray(tickers) || tickers.length === 0) return [];
  return tickers.map((t: any) => ({
    symbol: t.ticker || t.symbol || "",
    name: t.name || t.details?.name || t.ticker || t.symbol || "",
    price: resolveCurrentPrice(t),
    change: t.todaysChange ?? 0,
    changePercent: t.todaysChangePerc ?? 0,
    volume: t.day?.v > 0 ? t.day.v : (t.min?.av ?? t.min?.v ?? 0),
  }));
}

export default function PremarketPage() {
  const [activeTime, setActiveTime] = useState("Today");

  const { data: gainersData, isLoading: gLoad, refetch: gRefetch } = useQuery({
    queryKey: ["premarket-gainers"],
    queryFn: async () => {
      const res = await getTopGainers();
      const tickers = Array.isArray(res) ? res : (res?.tickers ?? []);
      return mapRows(tickers);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const { data: losersData, isLoading: lLoad, refetch: lRefetch } = useQuery({
    queryKey: ["premarket-losers"],
    queryFn: async () => {
      const res = await getTopLosers();
      const tickers = Array.isArray(res) ? res : (res?.tickers ?? []);
      return mapRows(tickers);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const handleTimeTab = (t: string) => {
    if (t !== "Today") {
      toast({ title: "Coming Soon", description: `${t} data will be available in a future update.` });
      return;
    }
    setActiveTime(t);
  };

  return (
    <div className="w-full">
      <MarketMoversTabBar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.75rem] font-bold mb-4 text-foreground">Pre-Market Movers</h1>

        <div className="flex items-center gap-1 mb-6 overflow-x-auto">
          {TIME_TABS.map((t) => (
            <button
              key={t}
              onClick={() => handleTimeTab(t)}
              className="text-[0.875rem] px-3.5 py-1.5 rounded transition-colors whitespace-nowrap"
              style={
                activeTime === t
                  ? { background: "hsl(var(--foreground))", color: "hsl(var(--background))", fontWeight: 600 }
                  : { color: "hsl(var(--muted-foreground))" }
              }
            >
              {t}
            </button>
          ))}
        </div>

        <IndexSparklines />

        <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1 mb-4">
          <AdBanner slot="top" />
        </div>

        <MoversTable
          sectionTitle="Pre-Market Gainers"
          rows={gainersData ?? []}
          isLoading={gLoad}
          refetch={gRefetch}
          defaultSortDesc={true}
          colorMode="green"
        />

        <div className="my-6 border-t border-border" />

        <MoversTable
          sectionTitle="Pre-Market Losers"
          rows={losersData ?? []}
          isLoading={lLoad}
          refetch={lRefetch}
          defaultSortDesc={false}
          colorMode="red"
        />

        <p className="text-xs text-muted-foreground mt-4">
          Data reflects latest available market activity. Dedicated premarket data requires an upgraded data plan.
        </p>

        <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
          <AdBanner slot="bottom" />
        </div>
      </div>
    </div>
  );
}
