import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoversTable } from "@/components/markets/MarketMoversLayout";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { etSessionDate } from "@/lib/markets/movers-integrity";
import {
  fetchPremarketGainersRows,
  fetchPremarketLosersRows,
} from "@/lib/markets/movers-page-fetch";
import { delayedMarketMoversSeoDescription } from "@/lib/markets/movers-provenance";
import { canRetryEmptyPremarketFetch } from "@/lib/markets/movers-query-lifecycle";
import {
  MOVERS_PAGE_INNER_CLASS,
  MOVERS_PAGE_SHELL_CLASS,
} from "@/components/markets/movers-responsive";

const TIME_TABS = ["Today"];

export default function PremarketPage() {
  const [activeTime, setActiveTime] = useState("Today");
  const sessionDate = etSessionDate();
  const gEmptyRetries = useRef(0);
  const lEmptyRetries = useRef(0);

  useEffect(() => {
    gEmptyRetries.current = 0;
    lEmptyRetries.current = 0;
  }, [sessionDate]);

  const {
    data: gainersPack,
    isLoading: gLoad,
    isError: gError,
    isSuccess: gSuccess,
    refetch: gRefetch,
  } = useQuery({
    queryKey: ["premarket-gainers", sessionDate],
    queryFn: () => fetchPremarketGainersRows(),
    staleTime: 30_000,
    retry: 3,
    retryDelay: 3000,
  });

  const {
    data: losersPack,
    isLoading: lLoad,
    isError: lError,
    isSuccess: lSuccess,
    refetch: lRefetch,
  } = useQuery({
    queryKey: ["premarket-losers", sessionDate],
    queryFn: () => fetchPremarketLosersRows(),
    staleTime: 30_000,
    retry: 3,
    retryDelay: 3000,
  });

  useEffect(() => {
    if (gLoad || gError || !gSuccess) return;
    if ((gainersPack?.rows.length ?? 0) > 0) return;
    if (!canRetryEmptyPremarketFetch(gEmptyRetries.current)) return;
    gEmptyRetries.current += 1;
    void gRefetch();
  }, [gLoad, gError, gSuccess, gainersPack?.rows.length, gRefetch]);

  useEffect(() => {
    if (lLoad || lError || !lSuccess) return;
    if ((losersPack?.rows.length ?? 0) > 0) return;
    if (!canRetryEmptyPremarketFetch(lEmptyRetries.current)) return;
    lEmptyRetries.current += 1;
    void lRefetch();
  }, [lLoad, lError, lSuccess, losersPack?.rows.length, lRefetch]);

  const handleTimeTab = (t: string) => {
    if (t !== "Today") {
      toast({ title: "Coming Soon", description: `${t} data will be available in a future update.` });
      return;
    }
    setActiveTime(t);
  };

  usePageSeo({
    title: `Pre-Market Stock Movers | ${BRAND.name}`,
    description: delayedMarketMoversSeoDescription(
      "pre-market stock price movements, gainers, and losers",
      BRAND.name,
    ),
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
          rows={gainersPack?.rows ?? []}
          provenance={gainersPack?.provenance}
          isLoading={gLoad}
          isError={gError}
          isFetchEmpty={gSuccess && (gainersPack?.rows.length ?? 0) === 0}
          premarket
          refetch={gRefetch}
          defaultSortDesc={true}
          colorMode="green"
        />

        <div className="my-6 border-t border-border" />

        <MoversTable
          sectionTitle="Pre-Market Losers"
          rows={losersPack?.rows ?? []}
          provenance={losersPack?.provenance}
          isLoading={lLoad}
          isError={lError}
          isFetchEmpty={lSuccess && (losersPack?.rows.length ?? 0) === 0}
          premarket
          refetch={lRefetch}
          defaultSortDesc={false}
          colorMode="red"
        />

        <p className="text-xs text-muted-foreground mt-4">
          {gainersPack?.provenance.delayDisclosure ?? "15-minute delayed market data"}. Dedicated premarket feeds are not enabled on this plan.
        </p>

        <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
          <AdBanner slot="bottom" />
        </div>
      </div>
    </div>
  );
}
