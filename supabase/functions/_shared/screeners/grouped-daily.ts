/**
 * Polygon grouped daily stock bars. Auth is Authorization: Bearer only.
 * Invalid bars are skipped; a malformed envelope fails closed.
 */

import {
  fetchJsonBounded,
  type FetchLike,
  ProviderUnavailableError,
} from "./provider.ts";

export type BarHL = { h: number; l: number };

export const GROUPED_BASE =
  "https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks";
export const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]*$/;
export const SYMBOL_MAX_LEN = 12;

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = raw.trim().toUpperCase();
  if (!symbol || symbol.length > SYMBOL_MAX_LEN) return null;
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

export function isValidHighLow(high: number, low: number): boolean {
  return (
    Number.isFinite(high) &&
    Number.isFinite(low) &&
    high > 0 &&
    low > 0 &&
    low <= high
  );
}

export function groupedUrl(date: string): string {
  return `${GROUPED_BASE}/${date}?adjusted=true`;
}

export function parseGroupedResults(body: unknown): Map<string, BarHL> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ProviderUnavailableError("provider_response_invalid");
  }
  const results = (body as { results?: unknown }).results;
  if (results === undefined || results === null) return new Map();
  if (!Array.isArray(results)) {
    throw new ProviderUnavailableError("provider_response_invalid");
  }

  const out = new Map<string, BarHL>();
  for (const item of results) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as { T?: unknown; h?: unknown; l?: unknown };
    const symbol = normalizeSymbol(row.T);
    if (!symbol) continue;
    const high = Number(row.h);
    const low = Number(row.l);
    if (!isValidHighLow(high, low)) continue;
    out.set(symbol, { h: high, l: low });
  }
  return out;
}

export async function fetchGroupedDay(
  date: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<Map<string, BarHL>> {
  const body = await fetchJsonBounded(groupedUrl(date), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  }, { fetchImpl });
  return parseGroupedResults(body);
}

export function barsToPayload(
  bars: Map<string, BarHL>,
): Array<{ symbol: string; h: number; l: number }> {
  const out: Array<{ symbol: string; h: number; l: number }> = [];
  for (const [symbol, hl] of bars) {
    out.push({ symbol, h: hl.h, l: hl.l });
  }
  return out;
}
