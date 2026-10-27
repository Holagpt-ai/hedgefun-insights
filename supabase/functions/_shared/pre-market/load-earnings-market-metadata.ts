import {
  SCREENER_STALE_MINUTES,
  ageMinutes,
  finiteOrNull,
  isoOrNull,
  normalizeSymbol,
  positiveOrNull,
} from "./contract.ts";
import {
  emptyEarningsSymbolMetadata,
  type EarningsSymbolMarketMetadata,
} from "./earnings-market-impact.ts";

/** Screener tabs that may contribute verified session activity (not top-N radar slice). */
export const EARNINGS_ACTIVITY_SCREENER_TABS = new Set([
  "day_trade_radar",
  "volume_spikes",
  "unusual_volume",
  "gainers_losers",
  "gappers",
  "new_highs_lows",
]);

export const EARNINGS_SCREENER_SYMBOL_CHUNK_SIZE = 40;
export const EARNINGS_SCREENER_ROWS_PER_CHUNK_LIMIT = 600;
/** Caps screener round-trips so a large earnings pool cannot stall the workspace. */
export const EARNINGS_SCREENER_MAX_CHUNKS = 4;
/** At most two symbol-chunk queries in flight. */
export const EARNINGS_SCREENER_CONCURRENT_CHUNKS = 2;
export const EARNINGS_SCREENER_CHUNK_TIMEOUT_MS = 4_000;

export type ScreenerActivityRow = {
  symbol: string;
  tab_id: string;
  volume: number | null;
  rvol_20d: number | null;
  change_percent: number | null;
  price: number | null;
  updated_at: string | null;
};

type ActivityQueryBuilder = {
  in: (col: string, values: string[]) => ActivityQueryBuilder;
  order: (col: string, opts: { ascending: boolean }) => ActivityQueryBuilder;
  limit: (n: number) => Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>;
};

export type EarningsMetadataDb = {
  from: (table: string) => {
    select: (cols: string) => ActivityQueryBuilder;
  };
};

function activityRowScore(row: ScreenerActivityRow): number {
  const rvol = finiteOrNull(row.rvol_20d) ?? 0;
  const vol = finiteOrNull(row.volume) ?? 0;
  return rvol * 1_000_000 + log10Cap(vol, 10);
}

function log10Cap(value: number, cap: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 0;
  return Math.min(cap, Math.log10(value));
}

export function isFreshScreenerActivityRow(
  updatedAt: string | null,
  opts: { nowMs: number; sessionActive: boolean },
): boolean {
  if (!updatedAt) return false;
  if (!opts.sessionActive) return false;
  const age = ageMinutes(updatedAt, opts.nowMs);
  if (age === null) return false;
  if (age < 0) return false;
  return age <= SCREENER_STALE_MINUTES;
}

/** Pure merge for tests — applies freshness and tab provenance before picking best activity row per symbol. */
export function mergeEarningsMarketMetadata(
  symbols: readonly string[],
  screenerRows: readonly ScreenerActivityRow[],
  capRows: readonly { symbol: string; market_cap: number | null }[],
  opts: { nowMs: number; sessionActive: boolean },
): Map<string, EarningsSymbolMarketMetadata> {
  const out = new Map<string, EarningsSymbolMarketMetadata>();
  for (const symbol of symbols) {
    out.set(symbol, emptyEarningsSymbolMetadata());
  }

  const bestActivity = new Map<string, { row: ScreenerActivityRow; score: number }>();
  for (const raw of screenerRows) {
    const symbol = normalizeSymbol(raw.symbol);
    if (!symbol || !out.has(symbol)) continue;
    if (!EARNINGS_ACTIVITY_SCREENER_TABS.has(raw.tab_id)) continue;
    const updated = isoOrNull(raw.updated_at);
    if (!isFreshScreenerActivityRow(updated, opts)) continue;
    const volume = positiveOrNull(raw.volume);
    const rvol = finiteOrNull(raw.rvol_20d);
    const changePct = finiteOrNull(raw.change_percent);
    if (volume === null && rvol === null && changePct === null) continue;

    const candidate: ScreenerActivityRow = {
      symbol,
      tab_id: raw.tab_id,
      volume,
      rvol_20d: rvol,
      change_percent: changePct,
      price: finiteOrNull(raw.price),
      updated_at: updated,
    };
    const score = activityRowScore(candidate);
    const prev = bestActivity.get(symbol);
    if (!prev || score > prev.score) bestActivity.set(symbol, { row: candidate, score });
  }

  for (const [symbol, best] of bestActivity) {
    const row = best.row;
    out.set(symbol, {
      ...emptyEarningsSymbolMetadata(),
      volume: row.volume,
      rvol_20d: row.rvol_20d,
      change_percent: row.change_percent,
      price: row.price,
      activity_verified: true,
      activity_as_of: row.updated_at,
      activity_tab_id: row.tab_id,
    });
  }

  for (const cap of capRows) {
    const symbol = normalizeSymbol(cap.symbol);
    if (!symbol || !out.has(symbol)) continue;
    const marketCap = finiteOrNull(cap.market_cap);
    if (marketCap === null || marketCap <= 0) continue;
    const prev = out.get(symbol)!;
    out.set(symbol, { ...prev, market_cap: marketCap });
  }

  return out;
}

function mapScreenerRecord(r: Record<string, unknown>): ScreenerActivityRow {
  return {
    symbol: String(r.symbol ?? ""),
    tab_id: String(r.tab_id ?? ""),
    volume: positiveOrNull(r.volume),
    rvol_20d: finiteOrNull(r.rvol_20d),
    change_percent: finiteOrNull(r.change_percent),
    price: finiteOrNull(r.price),
    updated_at: isoOrNull(r.updated_at),
  };
}

async function fetchEarningsScreenerChunk(
  db: EarningsMetadataDb,
  chunk: string[],
): Promise<ScreenerActivityRow[]> {
  const query = db.from("screener_results")
    .select("symbol, tab_id, volume, rvol_20d, change_percent, price, updated_at")
    .in("symbol", chunk)
    .order("updated_at", { ascending: false })
    .limit(EARNINGS_SCREENER_ROWS_PER_CHUNK_LIMIT);

  const result = await Promise.race([
    query,
    new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(
        () => resolve({ data: null, error: { message: "earnings_screener_chunk_timeout" } }),
        EARNINGS_SCREENER_CHUNK_TIMEOUT_MS,
      );
    }),
  ]);

  if (result.error || !result.data) return [];
  return result.data.map(mapScreenerRecord);
}

export async function fetchEarningsScreenerActivityRows(
  db: EarningsMetadataDb,
  symbols: readonly string[],
): Promise<ScreenerActivityRow[]> {
  const normalized = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean))] as string[];
  const chunks: string[][] = [];
  for (let i = 0; i < normalized.length && chunks.length < EARNINGS_SCREENER_MAX_CHUNKS; i += EARNINGS_SCREENER_SYMBOL_CHUNK_SIZE) {
    chunks.push(normalized.slice(i, i + EARNINGS_SCREENER_SYMBOL_CHUNK_SIZE));
  }

  const screenerRows: ScreenerActivityRow[] = [];
  for (let i = 0; i < chunks.length; i += EARNINGS_SCREENER_CONCURRENT_CHUNKS) {
    const batch = chunks.slice(i, i + EARNINGS_SCREENER_CONCURRENT_CHUNKS);
    const batchResults = await Promise.all(
      batch.map((chunk) => fetchEarningsScreenerChunk(db, chunk)),
    );
    for (const rows of batchResults) screenerRows.push(...rows);
  }

  return screenerRows;
}

export async function loadEarningsMarketMetadataForSymbols(
  db: EarningsMetadataDb,
  symbols: readonly string[],
  opts: {
    nowMs: number;
    sessionActive: boolean;
    capRows: readonly { symbol: string; market_cap: number | null }[];
  },
): Promise<Map<string, EarningsSymbolMarketMetadata>> {
  const normalized = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean))] as string[];
  let screenerRows: ScreenerActivityRow[] = [];
  try {
    screenerRows = await fetchEarningsScreenerActivityRows(db, normalized);
  } catch {
    screenerRows = [];
  }
  return mergeEarningsMarketMetadata(normalized, screenerRows, opts.capRows, {
    nowMs: opts.nowMs,
    sessionActive: opts.sessionActive,
  });
}
