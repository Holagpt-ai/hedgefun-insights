import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { resolveCurrentPrice } from "@/lib/price-utils";
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

export default function ActivePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["most-active-page"],
    queryFn: async () => {
      const [gainers, losers] = await Promise.all([getTopGainers(), getTopLosers()]);
      const g = Array.isArray(gainers) ? gainers : (gainers?.tickers ?? []);
      const l = Array.isArray(losers) ? losers : (losers?.tickers ?? []);
      const combined = [...g, ...l];
      // Dedupe by ticker
      const seen = new Set<string>();
      const unique = combined.filter((t: any) => {
        const sym = t.ticker || t.symbol || "";
        if (seen.has(sym)) return false;
        seen.add(sym);
        return true;
      });
      // Sort by volume desc
      unique.sort((a: any, b: any) => (b.day?.v ?? 0) - (a.day?.v ?? 0));
      return mapRows(unique.slice(0, 30));
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  return (
    <MarketMoversLayout
      sectionTitle="Most Active Today"
      rows={data ?? []}
      isLoading={isLoading}
      refetch={refetch}
      defaultSortDesc={true}
      colorMode="mixed"
    />
  );
}
