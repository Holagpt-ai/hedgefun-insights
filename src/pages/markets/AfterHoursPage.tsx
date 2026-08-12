import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { classifyTrackedAfterHoursMovers } from "@/lib/market-session";
import { MoversTable, type MoverRow } from "@/components/markets/MarketMoversLayout";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/usePageSeo";

const TIME_TABS = ["Today"];

function asMoverRows(
  rows: ReturnType<typeof classifyTrackedAfterHoursMovers>["gainers"],
): MoverRow[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    price: r.price,
    change: r.change,
    changePercent: r.changePercent,
    volume: r.volume,
  }));
}

export default function AfterHoursPage() {
  const [activeTime, setActiveTime] = useState("Today");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tracked-afterhours-movers"],
    queryFn: async () => {
      const [gainRes, lossRes] = await Promise.all([getTopGainers(), getTopLosers()]);
      const gainers = Array.isArray(gainRes) ? gainRes : (gainRes?.tickers ?? []);
      const losers = Array.isArray(lossRes) ? lossRes : (lossRes?.tickers ?? []);
      const classified = classifyTrackedAfterHoursMovers([...gainers, ...losers]);
      return {
        gainers: asMoverRows(classified.gainers),
        losers: asMoverRows(classified.losers),
      };
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

  usePageSeo({
    title: "After-Hours Stock Movers | HedgeFun",
    description: "Track after-hours stock price movements and extended trading activity on HedgeFun.",
  });

  return (
    <div className="w-full">
      <MarketMoversTabBar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.75rem] font-bold mb-4 text-foreground">After-Hours Movers</h1>

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
          sectionTitle="Tracked After-Hours Gainers"
          rows={data?.gainers ?? []}
          isLoading={isLoading}
          refetch={refetch}
          defaultSortDesc={true}
          colorMode="green"
        />

        <div className="my-6 border-t border-border" />

        <MoversTable
          sectionTitle="Tracked After-Hours Losers"
          rows={data?.losers ?? []}
          isLoading={isLoading}
          refetch={refetch}
          defaultSortDesc={false}
          colorMode="red"
        />

        <p className="text-xs text-muted-foreground mt-4">
          Tracked results use available provider mover candidates and reclassify each name by
          after-hours last versus regular close. This is not a full-market after-hours scan.
          Dedicated after-hours coverage requires an upgraded data plan.
        </p>

        <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
          <AdBanner slot="bottom" />
        </div>
      </div>
    </div>
  );
}
