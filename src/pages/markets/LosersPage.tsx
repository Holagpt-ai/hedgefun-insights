import { useQuery } from "@tanstack/react-query";
import { getTopLosers } from "@/lib/polygon";
import { resolveCurrentPrice, resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversLayout, type MoverRow } from "@/components/markets/MarketMoversLayout";

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

function getTitle(): string {
  const session = resolveMarketSession();
  if (session === "pre-market") return "Pre-Market Losers Today";
  if (session === "after-hours") return "After-Hours Losers Today";
  return "Top Losers Today";
}

export default function LosersPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-losers-page"],
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
    <MarketMoversLayout
      sectionTitle={getTitle()}
      rows={data ?? []}
      isLoading={isLoading}
      refetch={refetch}
      defaultSortDesc={false}
      colorMode="red"
    />
  );
}
