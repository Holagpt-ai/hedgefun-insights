import { useQuery } from "@tanstack/react-query";
import { resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage } from "@/components/markets/MarketMoversLayout";
import { defaultSortForMoverKind } from "@/components/markets/movers-table-sort";
import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { etSessionDate } from "@/lib/markets/movers-integrity";
import { fetchPublicMostActiveRows } from "@/lib/markets/movers-page-fetch";
import {
  delayedMarketMoversSeoDescription,
  MOST_ACTIVE_TRACKED_UNIVERSE_TITLE,
} from "@/lib/markets/movers-provenance";

export default function ActivePage() {
  const session = resolveMarketSession();
  const sessionDate = etSessionDate();

  const { data, isLoading, isError, isSuccess, refetch } = useQuery({
    queryKey: ["most-active-page", session, sessionDate],
    queryFn: async () => {
      const result = await fetchPublicMostActiveRows(session);
      return { ...result, rows: result.rows.slice(0, 30) };
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  usePageSeo({
    title: `${MOST_ACTIVE_TRACKED_UNIVERSE_TITLE} | ${BRAND.name}`,
    description: delayedMarketMoversSeoDescription(
      "the most actively traded symbols among tracked provider gainers and losers",
      BRAND.name,
    ),
  });

  return (
    <MarketMoversPage
      pageTitle="Market Movers"
      sectionTitle={MOST_ACTIVE_TRACKED_UNIVERSE_TITLE}
      rows={data?.rows ?? []}
      provenance={data?.provenance}
      isLoading={isLoading}
      isError={isError}
      isFetchEmpty={isSuccess && (data?.rows.length ?? 0) === 0}
      refetch={refetch}
      defaultSort={defaultSortForMoverKind("active")}
      colorMode="mixed"
    />
  );
}
