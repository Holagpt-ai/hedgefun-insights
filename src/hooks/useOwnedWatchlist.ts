import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestFence } from "@/lib/stock-chart/request-fence";

export interface WatchlistRow {
  symbol: string;
}

/**
 * Watchlist rows owned by the active authenticated user.
 * Clears synchronously on account switch/logout; ignores stale async responses.
 */
export function useOwnedWatchlist(userId: string | null | undefined) {
  const fenceRef = useRef(createRequestFence());
  const [trackedUserId, setTrackedUserId] = useState<string | null>(userId ?? null);
  const [rows, setRows] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));

  if ((userId ?? null) !== trackedUserId) {
    setTrackedUserId(userId ?? null);
    setRows([]);
    setLoading(Boolean(userId));
    fenceRef.current.bump();
  }

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const expectedUserId = userId;
    const generation = fenceRef.current.bump();
    setLoading(true);

    void (async () => {
      try {
        const { data } = await supabase
          .from("watchlists")
          .select("symbol")
          .eq("user_id", expectedUserId);
        if (!fenceRef.current.isCurrent(generation)) return;
        setRows(data ?? []);
      } catch {
        if (!fenceRef.current.isCurrent(generation)) return;
        setRows([]);
      } finally {
        if (fenceRef.current.isCurrent(generation)) setLoading(false);
      }
    })();
  }, [userId]);

  const owned = trackedUserId === (userId ?? null);
  return {
    watchlist: owned ? rows : [],
    watchlistOwnerId: trackedUserId,
    watchlistLoading: owned && loading,
  };
}
