import { supabase } from "@/integrations/supabase/client";
import {
  dedupeWatchlistSymbolRows,
  type WatchlistSymbolRow,
} from "@/lib/watchlist-v2/watchlist-persistence";

/** Ownership-safe watchlist symbol rows (RLS + user_id filter). Orders by `added_at`. */
export async function fetchWatchlistSymbolRows(userId: string): Promise<WatchlistSymbolRow[]> {
  const { data, error } = await supabase
    .from("watchlists")
    .select("id, symbol, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  const mapped = (data ?? []).map((r) => ({
    id: r.id,
    symbol: (r.symbol ?? "").toUpperCase(),
    added_at: r.added_at,
  }));
  return dedupeWatchlistSymbolRows(mapped);
}
