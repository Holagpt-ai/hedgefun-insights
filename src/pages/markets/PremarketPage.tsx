import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { resolveCurrentPrice } from "@/lib/price-utils";
import { MarketMoversLayout, type MoverRow } from "@/components/markets/MarketMoversLayout";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { AdBanner } from "@/components/layout/AdBanner";

function mapRows(tickers: any[]): MoverRow[] {
  return tickers.map((t: any) => ({
    symbol: t.ticker || t.symbol || "",
    name: t.name || t.ticker || "",
    price: resolveCurrentPrice(t),
    change: t.todaysChange ?? 0,
    changePercent: t.todaysChangePerc ?? 0,
    volume: t.day?.v ?? t.volume ?? 0,
  }));
}

export default function PremarketPage() {
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

  return (
    <div className="w-full">
      <MarketMoversTabBar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.75rem] font-bold mb-4 text-foreground">Pre-Market Movers</h1>
        <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1 mb-4">
          <AdBanner slot="top" />
        </div>
        <MarketMoversLayout
          sectionTitle="Pre-Market Gainers"
          rows={gainersData ?? []}
          isLoading={gLoad}
          refetch={gRefetch}
          defaultSortDesc={true}
          colorMode="green"
        />
        <div className="my-6 border-t border-border" />
        <MarketMoversLayout
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
      </div>
      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </div>
  );
}
