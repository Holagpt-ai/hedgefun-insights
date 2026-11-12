import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCatalystPublishedLast24Count,
  fetchCatalystUpcomingEarningsCount,
} from "@/lib/catalyst/catalyst-summary-counts";

export function useCatalystUpcomingEarningsCount(args: {
  symbol?: string | null;
  upcomingDays?: number;
  enabled?: boolean;
}) {
  const { symbol = null, upcomingDays = 30, enabled = true } = args;
  return useQuery({
    queryKey: ["catalyst_summary_upcoming_earnings", symbol, upcomingDays],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      fetchCatalystUpcomingEarningsCount(supabase, { symbol, upcomingDays }),
  });
}

export function useCatalystPublishedLast24Count(args: {
  symbol?: string | null;
  enabled?: boolean;
}) {
  const { symbol = null, enabled = true } = args;
  return useQuery({
    queryKey: ["catalyst_summary_last24", symbol],
    enabled,
    staleTime: 60_000,
    queryFn: () => fetchCatalystPublishedLast24Count(supabase, { symbol }),
  });
}
