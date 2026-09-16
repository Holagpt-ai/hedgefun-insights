import { isFiniteNumber } from "@/lib/screeners/contract";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import { getFloat } from "@/lib/polygon";
import { mapPool } from "./concurrency";

export const FLOAT_STALE_TIME_MS = 18 * 60 * 60 * 1000;
export const FLOAT_FETCH_CONCURRENCY = 4;

export interface RadarFloatRecord {
  ticker: string;
  float: number | null;
  asOf: string | null;
  source: "massive_float";
}

function finitePositiveShares(value: unknown): number | null {
  if (!isFiniteNumber(value) || (value as number) <= 0) return null;
  return value as number;
}

function asOfFrom(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/**
 * Map a Massive / Polygon Float payload.
 * Uses free-float fields only. Never substitutes shares outstanding.
 */
export function mapFloatPayload(ticker: string, payload: unknown): RadarFloatRecord {
  const empty: RadarFloatRecord = {
    ticker,
    float: null,
    asOf: null,
    source: "massive_float",
  };
  if (!payload || typeof payload !== "object") return empty;

  const root = payload as Record<string, unknown>;
  if (root.source === "massive_float") {
    return {
      ticker: typeof root.ticker === "string" ? root.ticker : ticker,
      float: finitePositiveShares(root.float),
      asOf: asOfFrom(root.as_of),
      source: "massive_float",
    };
  }

  const rawResults = root.results;
  const row =
    Array.isArray(rawResults)
      ? (rawResults.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined)
      : rawResults && typeof rawResults === "object"
        ? (rawResults as Record<string, unknown>)
        : root.ticker || root.float || root.free_float
          ? root
          : undefined;
  if (!row) return empty;

  const float =
    finitePositiveShares(row.float) ??
    finitePositiveShares(row.free_float) ??
    finitePositiveShares(row.float_shares);

  return {
    ticker: typeof row.ticker === "string" ? row.ticker : ticker,
    float,
    asOf: asOfFrom(row.as_of) ?? asOfFrom(row.updated) ?? asOfFrom(row.asOf),
    source: "massive_float",
  };
}

export async function getFloatForSymbol(symbol: string): Promise<RadarFloatRecord> {
  const ticker = normalizeSymbol(symbol);
  if (!ticker) {
    return { ticker: "", float: null, asOf: null, source: "massive_float" };
  }
  try {
    const payload = await getFloat(ticker);
    return mapFloatPayload(ticker, payload);
  } catch {
    return { ticker, float: null, asOf: null, source: "massive_float" };
  }
}

export async function getFloatForSymbols(
  symbols: readonly string[],
  concurrency: number = FLOAT_FETCH_CONCURRENCY,
): Promise<Map<string, RadarFloatRecord>> {
  const unique = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean) as string[])];
  const rows = await mapPool(unique, concurrency, getFloatForSymbol);
  const out = new Map<string, RadarFloatRecord>();
  for (const row of rows) {
    if (row.ticker) out.set(row.ticker, row);
  }
  return out;
}
