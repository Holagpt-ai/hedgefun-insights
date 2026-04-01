import { useQuery } from "@tanstack/react-query";
import { getTopGainers } from "@/lib/polygon";
import { resolveCurrentPrice, resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage, type MoverRow } from "@/components/markets/MarketMoversLayout";

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

function getTitle(): { page: string; section: string } {
  const session = resolveMarketSession();
  if (session === "pre-market") return { page: "Market Movers", section: "Pre-Market Gainers Today" };
  if (session === "after-hours") return { page: "Market Movers", section: "After-Hours Gainers Today" };
  return { page: "Market Movers", section: "Top Gainers Today" };
}

export default function GainersPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-gainers-page"],
    queryFn: async () => {
      const res = await getTopGainers();
      const tickers = Array.isArray(res) ? res : (res?.tickers ?? []);
      return mapRows(tickers);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const titles = getTitle();

  return (
    <MarketMoversPage
      pageTitle={titles.page}
      sectionTitle={titles.section}
      rows={data ?? []}
      isLoading={isLoading}
      refetch={refetch}
      defaultSortDesc={true}
      colorMode="green"
    />
  );
}
