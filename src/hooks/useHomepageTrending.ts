import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mapTrendingStockRows,
  type TrendingTableRow,
} from "@/lib/trending/trending-page-present";

/** Shared volume-ranked trending feed for hero chips and Trending Now rail. */
export function useHomepageTrending(limit = 8) {
  return useQuery({
    queryKey: ["homepage-trending", limit],
    queryFn: async (): Promise<TrendingTableRow[] | null> => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol, name, market_cap, change_percent, volume, updated_at")
        .not("volume", "is", null)
        .gt("volume", 0)
        .order("volume", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return mapTrendingStockRows(data);
    },
    staleTime: 300_000,
  });
}