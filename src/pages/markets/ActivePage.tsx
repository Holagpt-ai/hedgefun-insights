import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { resolveCurrentPrice } from "@/lib/price-utils";
import { MarketMoversPage, type MoverRow } from "@/components/markets/MarketMoversLayout";

function mapRows(tickers: any[]): MoverRow[] {
  return tickers.map((t: any) => ({
    symbol: t.ticker || t.symbol || "",
    name: t.name || t.details?.name || t.ticker || t.symbol || "",
    price: resolveCurrentPrice(t),
    change: t.todaysChange ?? 0,
    changePercent: t.todaysChangePerc ?? 0,
    volume: t.day?.v > 0 ? t.day.v : (t.min?.av ?? t.min?.v ?? 0),
  }));
}

export default function ActivePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["most-active-page"],
    queryFn: async () => {
      const [gainers, losers] = await Promise.all([getTopGainers(), getTopLosers()]);
      const g = Array.isArray(gainers) ? gainers : (gainers?.tickers ?? []);
      const l = Array.isArray(losers) ? losers : (losers?.tickers ?? []);
      const seen = new Set<string>();
      const unique = [...g, ...l].filter((t: any) => {
        const sym = t.ticker || t.symbol || "";
        if (seen.has(sym)) return false;
        seen.add(sym);
        return true;
      });
      const vol = (t: any) => t.day?.v > 0 ? t.day.v : (t.min?.av ?? t.min?.v ?? 0);
      unique.sort((a: any, b: any) => vol(b) - vol(a));
      return mapRows(unique.slice(0, 30));
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  return (
    <MarketMoversPage
      pageTitle="Market Movers"
      sectionTitle="Most Active Today"
      rows={data ?? []}
      isLoading={isLoading}
      refetch={refetch}
      defaultSortDesc={true}
      colorMode="mixed"
    />
  );
}
