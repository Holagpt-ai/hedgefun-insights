import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface HomepageWatchlistAssetRow {
  symbol: string;
  name: string | null;
  price: number | null;
  changePercent: number | null;
  updatedAt: string | null;
}

export function useHomepageWatchlistAssets() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["homepage-watchlist-assets", user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<HomepageWatchlistAssetRow[]> => {
      const { data: wl, error: wlErr } = await supabase
        .from("watchlists")
        .select("symbol")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (wlErr) throw new Error(wlErr.message);
      const symbols = [...new Set((wl ?? []).map((r) => r.symbol).filter(Boolean))];
      if (symbols.length === 0) return [];

      const { data: stocks, error: stErr } = await supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, updated_at")
        .in("symbol", symbols);
      if (stErr) throw new Error(stErr.message);

      const bySym = new Map((stocks ?? []).map((s) => [s.symbol, s]));
      return symbols.map((symbol) => {
        const row = bySym.get(symbol);
        return {
          symbol,
          name: row?.name ?? null,
          price: row?.price ?? null,
          changePercent: row?.change_percent ?? null,
          updatedAt: row?.updated_at ?? null,
        };
      });
    },
  });
}