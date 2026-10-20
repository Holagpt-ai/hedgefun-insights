import type { QueryKey, PlaceholderDataFunction } from "@tanstack/react-query";

export const WATCHLIST_V2_QUERY_ROOT = "watchlist-v2" as const;

export function watchlistSymbolsQueryKey(userId: string | null | undefined): QueryKey {
  return [WATCHLIST_V2_QUERY_ROOT, "symbols", userId ?? null];
}

export function watchlistAnalysisQueryKey(
  userId: string | null | undefined,
  symbols: readonly string[],
): QueryKey {
  return [WATCHLIST_V2_QUERY_ROOT, "analysis", userId ?? null, normalizeSymbolsKey(symbols)];
}

export function normalizeSymbolsKey(symbols: readonly string[]): string {
  const out = new Set<string>();
  for (const raw of symbols) {
    const s = (raw ?? "").trim().toUpperCase();
    if (s) out.add(s);
  }
  return [...out].sort().join(",");
}

function queryKeyUserId(key: QueryKey): string | null {
  if (key.length < 3) return null;
  const raw = key[2];
  return typeof raw === "string" ? raw : null;
}

function queryKeySymbolsKey(key: QueryKey): string | null {
  if (key.length < 4) return null;
  const raw = key[3];
  return typeof raw === "string" ? raw : null;
}

/** Keep prior symbol rows only for the same authenticated user during transient refetch. */
export function watchlistSymbolsPlaceholder<T>(
  userId: string | null | undefined,
): PlaceholderDataFunction<T, Error, T, QueryKey> {
  return (previousData, previousQuery) => {
    if (!userId || !previousQuery) return undefined;
    if (queryKeyUserId(previousQuery.queryKey) !== userId) return undefined;
    return previousData;
  };
}

/** Keep prior analysis only for the same user and identical symbol set. */
export function watchlistAnalysisPlaceholder<T>(
  userId: string | null | undefined,
  symbols: readonly string[],
): PlaceholderDataFunction<T, Error, T, QueryKey> {
  const symbolsKey = normalizeSymbolsKey(symbols);
  return (previousData, previousQuery) => {
    if (!userId || !symbolsKey || !previousQuery) return undefined;
    if (queryKeyUserId(previousQuery.queryKey) !== userId) return undefined;
    if (queryKeySymbolsKey(previousQuery.queryKey) !== symbolsKey) return undefined;
    return previousData;
  };
}
