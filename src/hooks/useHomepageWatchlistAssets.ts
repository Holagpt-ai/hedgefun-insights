import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWatchlistSymbolRows } from "@/lib/watchlist-v2/fetch-watchlist-symbols";
import {
  HOMEPAGE_WATCHLIST_PREVIEW_LIMIT,
  homepageWatchlistQuotesQueryKey,
  watchlistSymbolsPlaceholder,
  watchlistSymbolsQueryKey,
} from "@/lib/watchlist-v2/watchlist-query-isolation";

export interface HomepageWatchlistAssetRow {
  symbol: string;
  name: string | null;
  price: number | null;
  changePercent: number | null;
  updatedAt: string | null;
}

type QuoteEnrichment = {
  name: string | null;
  price: number | null;
  changePercent: number | null;
  updatedAt: string | null;
};

/**
 * Homepage My Assets: reuse Watchlist V2 symbol query/cache, then best-effort
 * quote enrichment. Symbol retrieval failures are errors; quote failures are not.
 */
export function useHomepageWatchlistAssets() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const symbolsQuery = useQuery({
    queryKey: watchlistSymbolsQueryKey(userId),
    enabled: !!userId,
    staleTime: 30_000,
    retry: 2,
    placeholderData: watchlistSymbolsPlaceholder(userId),
    queryFn: async () => fetchWatchlistSymbolRows(userId!),
  });

  const previewSymbols = useMemo(() => {
    const rows = symbolsQuery.data ?? [];
    return rows.slice(0, HOMEPAGE_WATCHLIST_PREVIEW_LIMIT).map((r) => r.symbol);
  }, [symbolsQuery.data]);

  const quotesQuery = useQuery({
    queryKey: homepageWatchlistQuotesQueryKey(userId, previewSymbols),
    enabled: !!userId && previewSymbols.length > 0,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<Record<string, QuoteEnrichment>> => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, updated_at")
        .in("symbol", previewSymbols);
      if (error) throw new Error(error.message);
      const bySym: Record<string, QuoteEnrichment> = {};
      for (const row of data ?? []) {
        const symbol = (row.symbol ?? "").toUpperCase();
        if (!symbol) continue;
        bySym[symbol] = {
          name: row.name ?? null,
          price: typeof row.price === "number" ? row.price : null,
          changePercent: typeof row.change_percent === "number" ? row.change_percent : null,
          updatedAt: row.updated_at ?? null,
        };
      }
      return bySym;
    },
  });

  const data = useMemo((): HomepageWatchlistAssetRow[] => {
    if (!userId) return [];
    return previewSymbols.map((symbol) => {
      const quote = quotesQuery.data?.[symbol];
      return {
        symbol,
        name: quote?.name ?? null,
        price: quote?.price ?? null,
        changePercent: quote?.changePercent ?? null,
        updatedAt: quote?.updatedAt ?? null,
      };
    });
  }, [previewSymbols, quotesQuery.data, userId]);

  return {
    data,
    isLoading: !!userId && symbolsQuery.isLoading,
    isError: !!userId && symbolsQuery.isError,
    isEmpty: !!userId && !symbolsQuery.isLoading && !symbolsQuery.isError && previewSymbols.length === 0,
    /** Quotes failed or still pending after symbols loaded — never blocks symbol display. */
    quotesUnavailable:
      previewSymbols.length > 0 &&
      !quotesQuery.isLoading &&
      (quotesQuery.isError || quotesQuery.data === undefined),
    quotesLoading: quotesQuery.isLoading,
  };
}
