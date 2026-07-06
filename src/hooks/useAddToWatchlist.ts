import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Shared watchlist add helper. Mirrors the exact insert pattern used by
 * WatchlistPage.addMutation and StockCtaButtons so all surfaces stay in sync.
 *
 * - Insert shape: { user_id, symbol: symbol.toUpperCase() }
 * - Duplicate (Postgres 23505) → info toast
 * - AI analysis is triggered server-side via Database Webhook on watchlists INSERT;
 *   this hook must never call analyze-watchlist-tickers directly.
 */
export function useAddToWatchlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch the user's current watchlist symbols. Shares cache keys with
  // WatchlistPage so the "already added" state stays consistent across pages.
  const { data: watchlistSymbols } = useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("id, symbol")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const addedSet = new Set(
    (watchlistSymbols ?? []).map((r) => (r.symbol ?? "").toUpperCase()),
  );

  const isAdded = useCallback(
    (symbol: string) => addedSet.has(symbol.toUpperCase()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchlistSymbols],
  );

  const mutation = useMutation({
    mutationFn: async (symbol: string) => {
      if (!user?.id) {
        throw Object.assign(new Error("not_authenticated"), {
          code: "not_authenticated",
        });
      }
      const upper = symbol.toUpperCase();
      const { error } = await supabase
        .from("watchlists")
        .insert({ user_id: user.id, symbol: upper });
      if (error) throw error;
      return upper;
    },
    onSuccess: (upper) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["watchlist", user.id] });
      }
      toast.success(`${upper} added to watchlist`);
    },
    onError: (err: unknown, symbol) => {
      const e = err as { code?: string; message?: string };
      const upper = String(symbol).toUpperCase();
      if (e?.code === "not_authenticated") {
        toast.error("Sign in to save stocks to your watchlist");
        return;
      }
      if (e?.code === "23505") {
        toast.info(`${upper} is already in your watchlist`);
        return;
      }
      toast.error("Failed to add to watchlist", { description: e?.message });
    },
  });

  const add = useCallback(
    (symbol: string) => {
      if (!user?.id) {
        toast.error("Sign in to save stocks to your watchlist");
        return;
      }
      mutation.mutate(symbol);
    },
    [mutation, user?.id],
  );

  return {
    add,
    isAdded,
    isPending: mutation.isPending,
    pendingSymbol:
      mutation.isPending && typeof mutation.variables === "string"
        ? mutation.variables.toUpperCase()
        : null,
    isAuthenticated: !!user?.id,
  };
}
