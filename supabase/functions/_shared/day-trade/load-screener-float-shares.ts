import type { QualificationDb } from "./persist-qualification-lifecycle.ts";

type ScreenerFloatRow = {
  symbol: string;
  float_shares: number | null;
  provider_as_of: string | null;
};

type FloatLookupDb = QualificationDb & {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, values: string[]) => Promise<{
        data: ScreenerFloatRow[] | null;
        error: { message: string } | null;
      }>;
    };
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
  const { data, error } = await lookupDb.from("screener_results")
    .select("symbol, float_shares, provider_as_of")
    .in("symbol", normalized);
  if (error || !data) return out;

  const best = new Map<string, { floatShares: number; providerMs: number }>();
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
  for (const [symbol, entry] of best) out.set(symbol, entry.floatShares);
  return out;
}
