import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage } from "@/components/markets/MarketMoversLayout";
import { defaultSortForMoverKind } from "@/components/markets/movers-table-sort";
import { usePageSeo } from "@/hooks/usePageSeo";
import { mapPolygonMovers, polygonTickersFromResponse, type MoverSession } from "@/lib/markets/movers-integrity";

function toMoverSession(session: ReturnType<typeof resolveMarketSession>): MoverSession {
  if (session === "pre-market") return "premarket";
  if (session === "after-hours") return "afterhours";
  return "regular";
}

export default function ActivePage() {
  const session = resolveMarketSession();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["most-active-page", session],
    queryFn: async () => {
      const [gainers, losers] = await Promise.all([getTopGainers(), getTopLosers()]);
      const combined = [
        ...polygonTickersFromResponse(gainers),
        ...polygonTickersFromResponse(losers),
      ];
      return mapPolygonMovers(combined, toMoverSession(session), { sort: "volume_desc" }).rows.slice(0, 30);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  usePageSeo({
    title: "Most Active Stocks Today | HedgeFun",
    description: "See today's most actively traded stocks by volume with real-time data on HedgeFun.",
  });

  return (
    <MarketMoversPage
      pageTitle="Market Movers"
      sectionTitle="Most Active Today"
      rows={data ?? []}
      isLoading={isLoading}
      refetch={refetch}
      defaultSort={defaultSortForMoverKind("active")}
      colorMode="mixed"
    />
  );
}
