/** Normalize and dedupe persisted watchlist rows (client boundary). */

export interface WatchlistSymbolRow {
  id: string;
  symbol: string;
  added_at: string | null;
}

/**
 * Keeps one row per uppercase symbol. Prefers the earliest `added_at` when duplicates exist.
 */
export function dedupeWatchlistSymbolRows(rows: readonly WatchlistSymbolRow[]): WatchlistSymbolRow[] {
  const bySymbol = new Map<string, WatchlistSymbolRow>();
  for (const row of rows) {
    const symbol = (row.symbol ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const normalized: WatchlistSymbolRow = { ...row, symbol };
    const prev = bySymbol.get(symbol);
    if (!prev) {
      bySymbol.set(symbol, normalized);
      continue;
    }
    const prevAt = prev.added_at ? Date.parse(prev.added_at) : Number.POSITIVE_INFINITY;
    const nextAt = normalized.added_at ? Date.parse(normalized.added_at) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(nextAt) && nextAt < prevAt) {
      bySymbol.set(symbol, normalized);
    }
  }
  return [...bySymbol.values()].sort((a, b) => {
    const aT = a.added_at ? Date.parse(a.added_at) : 0;
    const bT = b.added_at ? Date.parse(b.added_at) : 0;
    if (bT !== aT) return bT - aT;
    return a.symbol.localeCompare(b.symbol);
  });
}
