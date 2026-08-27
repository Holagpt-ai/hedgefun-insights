import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { classifyTrackedAfterHoursMovers, type SnapshotTicker } from "@/lib/market-session";
import { resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage } from "@/components/markets/MarketMoversLayout";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  mapPolygonMovers,
  moverFromExtendedObservation,
  polygonTickersFromResponse,
  selectCanonicalCurrentMovers,
  toMoverListRow,
  SOURCE_POLYGON,
} from "@/lib/markets/movers-integrity";

function getTitle(): { page: string; section: string } {
  const session = resolveMarketSession();
  if (session === "pre-market") return { page: "Market Movers", section: "Pre-Market Gainers Today" };
  if (session === "after-hours") {
    return { page: "Market Movers", section: "Tracked After-Hours Gainers" };
  }
  return { page: "Market Movers", section: "Top Gainers Today" };
}

export default function GainersPage() {
  const session = resolveMarketSession();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-gainers-page", session],
    queryFn: async () => {
      if (session === "after-hours") {
        const [gainRes, lossRes] = await Promise.all([getTopGainers(), getTopLosers()]);
        const gainers = polygonTickersFromResponse(gainRes) as SnapshotTicker[];
        const losers = polygonTickersFromResponse(lossRes) as SnapshotTicker[];
        const classified = classifyTrackedAfterHoursMovers([...gainers, ...losers]);
        const validated = classified.gainers.map((r) =>
          moverFromExtendedObservation({
            symbol: r.symbol,
            name: r.name,
            extendedLast: r.extended_last,
            regularClose: r.regular_close,
            volume: r.volume,
            changePercent: r.changePercent,
            source: SOURCE_POLYGON,
          }),
        );
        return selectCanonicalCurrentMovers(validated)
          .map(toMoverListRow)
          .filter((r): r is NonNullable<typeof r> => r !== null);
      }

      const res = await getTopGainers();
      const mappedSession = session === "pre-market" ? "premarket" : "regular";
      return mapPolygonMovers(res, mappedSession, { sort: "percent_desc" }).rows;
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const titles = getTitle();

  usePageSeo({
    title: "Top Stock Gainers Today | HedgeFun",
    description: "See today's top gaining stocks with real-time price and percentage change data on HedgeFun.",
  });

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
