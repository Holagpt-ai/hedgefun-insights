/** Client-side watchlist hints for AM brief highlighted symbols (no N+1). */
export function watchlistMembershipForSymbols(
  symbols: readonly string[],
  userWatchlist: ReadonlySet<string>,
): Array<{ symbol: string; on_user_watchlist: boolean }> {
  const out: Array<{ symbol: string; on_user_watchlist: boolean }> = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, on_user_watchlist: userWatchlist.has(symbol) });
  }
  return out;
}
