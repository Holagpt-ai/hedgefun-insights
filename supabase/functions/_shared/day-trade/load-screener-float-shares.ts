import type { QualificationDb } from "./persist-qualification-lifecycle.ts";

type ScreenerFloatRow = {
  symbol: string;
  float_shares: number | null;
  provider_as_of: string | null;
};

/** screener_results is keyed by (tab_id, symbol); cap chunks so PostgREST pages stay bounded. */
export const SCREENER_FLOAT_SYMBOL_CHUNK_SIZE = 40;
export const SCREENER_FLOAT_ROWS_PER_CHUNK_LIMIT = 500;

type FloatQueryBuilder = {
  in: (col: string, values: string[]) => FloatQueryBuilder;
  not: (col: string, op: string, value: null) => FloatQueryBuilder;
  order: (col: string, opts: { ascending: boolean }) => FloatQueryBuilder;
  limit: (n: number) => Promise<{
    data: ScreenerFloatRow[] | null;
    error: { message: string } | null;
  }>;
};

type FloatLookupDb = QualificationDb & {
  from: (table: string) => {
    select: (cols: string) => FloatQueryBuilder;
  };
};

function finitePositiveShares(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Latest verified float per symbol from screener_results (does not fabricate when absent). */
export async function loadLatestScreenerFloatSharesBySymbol(
  db: QualificationDb,
  symbols: readonly string[],
): Promise<Map<string, number>> {
  const normalized = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const out = new Map<string, number>();
  if (normalized.length === 0) return out;

  const lookupDb = db as FloatLookupDb;
  const best = new Map<string, { floatShares: number; providerMs: number }>();

  for (let i = 0; i < normalized.length; i += SCREENER_FLOAT_SYMBOL_CHUNK_SIZE) {
    const chunk = normalized.slice(i, i + SCREENER_FLOAT_SYMBOL_CHUNK_SIZE);
    const { data, error } = await lookupDb.from("screener_results")
      .select("symbol, float_shares, provider_as_of")
      .in("symbol", chunk)
      .not("float_shares", "is", null)
      .order("provider_as_of", { ascending: false })
      .limit(SCREENER_FLOAT_ROWS_PER_CHUNK_LIMIT);
    if (error || !data) continue;

    for (const row of data) {
      const symbol = row.symbol.trim().toUpperCase();
      const floatShares = finitePositiveShares(row.float_shares);
      if (floatShares === null) continue;
      const providerMs = Date.parse(String(row.provider_as_of ?? ""));
      const ms = Number.isFinite(providerMs) ? providerMs : Number.NEGATIVE_INFINITY;
      const prev = best.get(symbol);
      if (!prev || ms >= prev.providerMs) {
        best.set(symbol, { floatShares, providerMs: ms });
      }
    }
  }

  for (const [symbol, entry] of best) out.set(symbol, entry.floatShares);
  return out;
}
