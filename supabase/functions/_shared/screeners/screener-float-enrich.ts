/**
 * Bounded free-float enrichment for published screener rows only (ISS-037).
 * Uses Massive/Polygon Float — same contract as market-data Edge + Radar UI.
 */

import type { QualificationDb } from "../day-trade/persist-qualification-lifecycle.ts";
import { loadLatestScreenerFloatSharesBySymbol } from "../day-trade/load-screener-float-shares.ts";
import {
  FLOAT_CACHE_TTL_MS,
  resolveFloatProviderResult,
  type MassiveFloatRecord,
} from "../market-data/float.ts";
import type { FetchLike } from "./provider.ts";
import type { ScreenerResultRow } from "./rows.ts";

export const SCREENER_FLOAT_FETCH_CONCURRENCY = 6;
const POLYGON_FLOAT_PATH = "https://api.polygon.io/stocks/vX/float";

const isolateFloatCache = new Map<string, { record: MassiveFloatRecord; cachedAtMs: number }>();

export function resetScreenerFloatEnrichCacheForTests(): void {
  isolateFloatCache.clear();
}

function uniqueSymbolsFromRows(rows: readonly ScreenerResultRow[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const sym = row.symbol.trim().toUpperCase();
    if (sym) out.add(sym);
  }
  return [...out];
}

function readIsolateCache(ticker: string, nowMs: number): MassiveFloatRecord | null {
  const hit = isolateFloatCache.get(ticker);
  if (!hit) return null;
  if (nowMs - hit.cachedAtMs > FLOAT_CACHE_TTL_MS) {
    isolateFloatCache.delete(ticker);
    return null;
  }
  return hit.record;
}

function polygonFloatUrl(ticker: string, apiKey: string): string {
  const url = new URL(POLYGON_FLOAT_PATH);
  url.searchParams.set("ticker", ticker);
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
}

async function fetchFloatFromPolygon(
  ticker: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<{ data: MassiveFloatRecord; cache: boolean }> {
  try {
    const res = await fetchImpl(polygonFloatUrl(ticker, apiKey), {
      signal: AbortSignal.timeout(8_000),
    });
    const payload = res.ok ? await res.json().catch(() => null) : null;
    return resolveFloatProviderResult(ticker, { ok: res.ok, status: res.status }, payload);
  } catch {
    return resolveFloatProviderResult(ticker, { ok: false, status: 0 }, null);
  }
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export type ResolveScreenerFloatSharesInput = {
  symbols: readonly string[];
  nowMs: number;
  apiKey: string;
  fetchImpl: FetchLike;
  db?: QualificationDb;
};

/**
 * Resolve verified free float for a bounded symbol set (typically ≤ ~120 published rows).
 * Reuses fresh screener_results floats, then isolate cache, then Polygon Float API.
 */
export async function resolveScreenerFloatSharesBySymbol(
  input: ResolveScreenerFloatSharesInput,
): Promise<Map<string, number>> {
  const normalized = [...new Set(
    input.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
  )];
  const out = new Map<string, number>();
  if (normalized.length === 0) return out;

  const pending = new Set(normalized);

  if (input.db) {
    const fromDb = await loadLatestScreenerFloatSharesBySymbol(input.db, normalized, {
      nowMs: input.nowMs,
      maxAgeMs: FLOAT_CACHE_TTL_MS,
    });
    for (const [symbol, shares] of fromDb) {
      out.set(symbol, shares);
      pending.delete(symbol);
    }
  }

  for (const symbol of normalized) {
    if (!pending.has(symbol)) continue;
    const cached = readIsolateCache(symbol, input.nowMs);
    if (cached && cached.float !== null) {
      out.set(symbol, cached.float);
      pending.delete(symbol);
    }
  }

  const toFetch = [...pending];
  await mapPool(toFetch, SCREENER_FLOAT_FETCH_CONCURRENCY, async (symbol) => {
    const result = await fetchFloatFromPolygon(symbol, input.apiKey, input.fetchImpl);
    if (result.cache) {
      isolateFloatCache.set(symbol, { record: result.data, cachedAtMs: input.nowMs });
    }
    if (result.data.float !== null) {
      out.set(symbol, result.data.float);
    }
    return symbol;
  });

  return out;
}

export function attachVerifiedFloatSharesToRows(
  rows: ScreenerResultRow[],
  floats: ReadonlyMap<string, number>,
): ScreenerResultRow[] {
  return rows.map((row) => {
    const shares = floats.get(row.symbol.trim().toUpperCase());
    return {
      ...row,
      float_shares: shares ?? null,
    };
  });
}

export async function enrichPublishedRowsWithVerifiedFloat(
  rows: ScreenerResultRow[],
  input: Omit<ResolveScreenerFloatSharesInput, "symbols">,
): Promise<ScreenerResultRow[]> {
  const floats = await resolveScreenerFloatSharesBySymbol({
    ...input,
    symbols: uniqueSymbolsFromRows(rows),
  });
  return attachVerifiedFloatSharesToRows(rows, floats);
}
