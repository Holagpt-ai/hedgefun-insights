import { useQuery } from "@tanstack/react-query";
import { resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage } from "@/components/markets/MarketMoversLayout";
import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { fetchPublicLosersRows } from "@/lib/markets/movers-page-fetch";
import { delayedMarketMoversSeoDescription } from "@/lib/markets/movers-provenance";
import { etSessionDate } from "@/lib/markets/movers-integrity";

function getTitle(): { page: string; section: string } {
  const session = resolveMarketSession();
  if (session === "pre-market") return { page: "Market Movers", section: "Pre-Market Losers Today" };
  if (session === "after-hours") {
    return { page: "Market Movers", section: "Tracked After-Hours Losers" };
  }
  return { page: "Market Movers", section: "Top Losers Today" };
}

export default function LosersPage() {
  const session = resolveMarketSession();
  const sessionDate = etSessionDate();

  const { data, isLoading, isError, isSuccess, refetch } = useQuery({
    queryKey: ["top-losers-page", session, sessionDate],
    queryFn: () => fetchPublicLosersRows(session),
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const titles = getTitle();

  usePageSeo({
    title: `Top Stock Losers Today | ${BRAND.name}`,
    description: delayedMarketMoversSeoDescription("today's biggest losing stocks", BRAND.name),
  });

  return (
    <MarketMoversPage
      pageTitle={titles.page}
      sectionTitle={titles.section}
      rows={data?.rows ?? []}
      provenance={data?.provenance}
      isLoading={isLoading}
      isError={isError}
      isFetchEmpty={isSuccess && (data?.rows.length ?? 0) === 0}
      refetch={refetch}
      defaultSortDesc={false}
      colorMode="red"
    />
  );
}
