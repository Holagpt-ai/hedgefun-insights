import { useQuery } from "@tanstack/react-query";
import { resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage } from "@/components/markets/MarketMoversLayout";
import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { fetchPublicGainersRows } from "@/lib/markets/movers-page-fetch";
import { delayedMarketMoversSeoDescription } from "@/lib/markets/movers-provenance";
import { etSessionDate } from "@/lib/markets/movers-integrity";

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
  const sessionDate = etSessionDate();

  const { data, isLoading, isError, isSuccess, refetch } = useQuery({
    queryKey: ["top-gainers-page", session, sessionDate],
    queryFn: () => fetchPublicGainersRows(session),
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const titles = getTitle();

  usePageSeo({
    title: `Top Stock Gainers Today | ${BRAND.name}`,
    description: delayedMarketMoversSeoDescription("today's top gaining stocks", BRAND.name),
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
      defaultSortDesc={true}
      colorMode="green"
    />
  );
}
