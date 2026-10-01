import { normalizeTicker } from "./normalize.ts";
import type { CompanyRecord } from "./types.ts";

const CACHE_MS = 10 * 60 * 1000;
const MAX_ROWS = 20_000;
const PAGE = 1_000;
const LEGAL_SUFFIX = /(?:,)?\s+(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|llc|lp|holdings|group|n\.?v\.?|s\.?a\.?)\.?$/i;

type StockClient = { from(table: string): any };

let cache: { at: number; records: CompanyRecord[] } | null = null;

export function legalAlias(name: string): string | null {
  let current = name.trim();
  const original = current;
  for (let i = 0; i < 4; i++) {
    const next = current.replace(LEGAL_SUFFIX, "").replace(/[,\s]+$/g, "").trim();
    if (!next || next === current) break;
    current = next;
  }
  if (current.length < 4) return null;
  if (current.toLowerCase() === original.toLowerCase()) return null;
  return current;
}

function phrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * One pass over the existing public.stocks universe.
 * Alias collisions are dropped so two issuers cannot share a short name.
 */
export function buildCompanyUniverse(rows: readonly { ticker: string; name: string }[]): CompanyRecord[] {
  const prepared: { ticker: string; name: string; alias: string | null }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    const name = row.name.trim();
    if (!ticker || !name || seen.has(ticker)) continue;
    seen.add(ticker);
    prepared.push({ ticker, name, alias: legalAlias(name) });
  }
  const aliasCounts = new Map<string, number>();
  const nameOwner = new Map<string, string>();
  for (const row of prepared) {
    const nameKey = phrase(row.name);
    const owner = nameOwner.get(nameKey);
    nameOwner.set(nameKey, owner && owner !== row.ticker ? "*" : row.ticker);
    if (!row.alias) continue;
    const key = phrase(row.alias);
    aliasCounts.set(key, (aliasCounts.get(key) ?? 0) + 1);
  }
  return prepared.map((row) => {
    const aliases: string[] = [];
    if (row.alias) {
      const key = phrase(row.alias);
      const owner = nameOwner.get(key);
      const unique = (aliasCounts.get(key) ?? 0) === 1 && (!owner || owner === row.ticker);
      if (unique && key !== phrase(row.name)) aliases.push(row.alias);
    }
    return { ticker: row.ticker, name: row.name, aliases };
  });
}

/** Loads symbol + name once per invocation, then reuses the bounded cache. */
export async function loadCompanyUniverse(supabase: StockClient, now = Date.now()): Promise<CompanyRecord[]> {
  if (cache && now - cache.at < CACHE_MS) return cache.records;
  const rows: { ticker: string; name: string }[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase.from("stocks").select("symbol,name").order("symbol", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error("database");
    const page = data ?? [];
    for (const row of page) {
      if (typeof row.symbol === "string" && typeof row.name === "string") {
        rows.push({ ticker: row.symbol, name: row.name });
      }
    }
    if (page.length < PAGE) break;
  }
  const records = buildCompanyUniverse(rows);
  cache = { at: now, records };
  return records;
}

export function clearCompanyUniverseCache(): void {
  cache = null;
}
