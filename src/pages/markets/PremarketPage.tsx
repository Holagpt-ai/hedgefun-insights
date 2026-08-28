import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { MoversTable } from "@/components/markets/MarketMoversLayout";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/usePageSeo";
import { mapPolygonMovers } from "@/lib/markets/movers-integrity";
import {
  MOVERS_PAGE_INNER_CLASS,
  MOVERS_PAGE_SHELL_CLASS,
} from "@/components/markets/movers-responsive";

const TIME_TABS = ["Today"];

export default function PremarketPage() {
  const [activeTime, setActiveTime] = useState("Today");

  const { data: gainersData, isLoading: gLoad, refetch: gRefetch } = useQuery({
    queryKey: ["premarket-gainers"],
    queryFn: async () => {
      const res = await getTopGainers();
      return mapPolygonMovers(res, "premarket", { sort: "percent_desc" }).rows;
    },
    staleTime: 30_000,
    retry: 3,
    retryDelay: 3000,
  });

  const { data: losersData, isLoading: lLoad, refetch: lRefetch } = useQuery({
    queryKey: ["premarket-losers"],
    queryFn: async () => {
      const res = await getTopLosers();
      return mapPolygonMovers(res, "premarket", { sort: "percent_asc" }).rows;
    },
    staleTime: 30_000,
    retry: 3,
    retryDelay: 3000,
  });

  // Auto-retry once after 2s if initial fetch returns empty
  useEffect(() => {
    if (!gLoad && gainersData && gainersData.length === 0) {
      const t = setTimeout(() => gRefetch(), 2000);
      return () => clearTimeout(t);
    }
  }, [gLoad, gainersData, gRefetch]);

  useEffect(() => {
    if (!lLoad && losersData && losersData.length === 0) {
      const t = setTimeout(() => lRefetch(), 2000);
      return () => clearTimeout(t);
    }
  }, [lLoad, losersData, lRefetch]);

  const handleTimeTab = (t: string) => {
    if (t !== "Today") {
      toast({ title: "Coming Soon", description: `${t} data will be available in a future update.` });
      return;
    }
    setActiveTime(t);
  };

  usePageSeo({
    title: "Pre-Market Stock Movers | HedgeFun",
    description: "Track pre-market stock price movements, gainers, and losers before the market opens on HedgeFun.",
  });

  return (
    <div className={MOVERS_PAGE_SHELL_CLASS}>
      <MarketMoversTabBar />
      <div className={MOVERS_PAGE_INNER_CLASS}>
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
