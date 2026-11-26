import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCalendarWatchlistSymbols(): ReadonlySet<string> | null {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["calendar-watchlist-symbols", user?.id],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("watchlists")
        .select("symbol")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set((rows ?? []).map((r) => (r.symbol ?? "").toUpperCase()).filter(Boolean));
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
  if (!user?.id) return null;
  return data ?? new Set();
}