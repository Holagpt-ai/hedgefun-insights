import { useQuery } from "@tanstack/react-query";
import { etSessionDate } from "@/lib/markets/movers-integrity";
import {
  fetchHomepagePublicMoversBundle,
  homepagePublicMoversQueryKey,
} from "@/lib/markets/movers-page-fetch";
import { resolveMarketSession } from "@/lib/price-utils";

/** Shared delayed public movers bundle for homepage tables and Market Pulse. */
export function useHomepagePublicMovers() {
  const session = resolveMarketSession();
  const sessionDate = etSessionDate();

  return useQuery({
    queryKey: homepagePublicMoversQueryKey(session, sessionDate),
    queryFn: () => fetchHomepagePublicMoversBundle(session),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 3,
    retryDelay: 2000,
  });
}
