import type { QueryClient } from "@tanstack/react-query";
import { WATCHLIST_V2_QUERY_ROOT } from "@/lib/watchlist-v2/watchlist-query-isolation";

/** Invalidate legacy watchlist keys and V2 symbol/analysis trees after a symbols-table mutation. */
export function invalidateWatchlistClientCaches(
  queryClient: QueryClient,
  userId?: string | null,
): void {
  void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
  if (userId) {
    void queryClient.invalidateQueries({ queryKey: ["watchlist", userId] });
  }
  void queryClient.invalidateQueries({ queryKey: [WATCHLIST_V2_QUERY_ROOT] });
}
