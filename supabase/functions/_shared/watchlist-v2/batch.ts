// Pure helpers for the V2 batch analyzer worker.
// - dedupe tickers to unique + lexically ordered
// - deterministic legitimate owner selection
// - cursor resume filter

export interface WatchlistRow { symbol: unknown; user_id: unknown; }

export interface UniqueTicker {
  ticker: string;
  owner_id: string;
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,14}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reduce raw `public.watchlists` rows to a lexically-ordered list of unique
 * tickers, each paired with the deterministically-smallest legitimate owner
 * user_id (uuid sort). Rows with malformed ticker/user_id are dropped.
 * Ownership rows are never fabricated.
 */
export function deriveUniqueTickers(rows: WatchlistRow[]): UniqueTicker[] {
  const byTicker = new Map<string, string>(); // ticker -> smallest legitimate owner
  for (const r of rows) {
    const rawSym = typeof r.symbol === "string" ? r.symbol.trim().toUpperCase() : "";
    const rawUid = typeof r.user_id === "string" ? r.user_id.trim() : "";
    if (!TICKER_RE.test(rawSym)) continue;
    if (!UUID_RE.test(rawUid)) continue;
    const prev = byTicker.get(rawSym);
    if (prev === undefined || rawUid < prev) byTicker.set(rawSym, rawUid);
  }
  return [...byTicker.entries()]
    .map(([ticker, owner_id]) => ({ ticker, owner_id }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** Keep only tickers lexically > cursor. Empty cursor means "start from beginning". */
export function applyCursor(items: UniqueTicker[], cursor: string): UniqueTicker[] {
  if (!cursor) return items;
  return items.filter((x) => x.ticker.localeCompare(cursor) > 0);
}
