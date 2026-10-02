import { normalizeTicker } from "./normalize.ts";
import type { CompanyRecord, SourceRecord } from "./types.ts";

const STOCK_CATEGORY_DOMAIN = "https://www.globenewswire.com/rss/stock";
const US_EXCHANGE = /^(?:nasdaq|nyse(?:\s+american)?|amex)$/i;
const US_SYMBOL = /^[A-Z]{1,5}$/;

export function isGlobeNewswireHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "globenewswire.com" || host.endsWith(".globenewswire.com");
}

export function globeNewswireStockCategories(block: string): string[] {
  const out: string[] = [];
  const re = /<category\b([^>]*)>([\s\S]*?)<\/category>/gi;
  for (const match of block.matchAll(re)) {
    const attrs = match[1] ?? "";
    const domain = attrs.match(/\bdomain\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase() ?? "";
    if (domain !== STOCK_CATEGORY_DOMAIN) continue;
    const text = decodeCategory(match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!text || out.includes(text) || out.length >= 20) continue;
    out.push(text);
  }
  return out;
}

export type GlobeNewswireSymbolStatus = "none" | "unique" | "conflict" | "malformed";

/** US exchange symbols only. Non-US listings are ignored. Conflicting US symbols fail closed. */
export function parseGlobeNewswireUsSymbol(categories: readonly string[]): {
  status: GlobeNewswireSymbolStatus;
  symbol: string | null;
} {
  const symbols = new Set<string>();
  let sawMalformedUs = false;
  for (const raw of categories) {
    const match = raw.trim().match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*([A-Za-z0-9.-]+)$/);
    if (!match) {
      sawMalformedUs = true;
      continue;
    }
    const exchange = match[1].trim();
    const symbol = match[2].trim().toUpperCase();
    if (!US_EXCHANGE.test(exchange)) continue;
    if (!US_SYMBOL.test(symbol)) {
      sawMalformedUs = true;
      continue;
    }
    symbols.add(symbol);
  }
  if (symbols.size > 1) return { status: "conflict", symbol: null };
  if (symbols.size === 1) return { status: "unique", symbol: [...symbols][0] };
  if (sawMalformedUs) return { status: "malformed", symbol: null };
  return { status: "none", symbol: null };
}

export function applyGlobeNewswireTickerMetadata(
  metadata: Record<string, unknown>,
  source: Pick<SourceRecord, "hostname">,
  companies: readonly CompanyRecord[] | undefined,
): void {
  if (!isGlobeNewswireHost(source.hostname)) return;
  const categories = Array.isArray(metadata.provider_stock_categories)
    ? metadata.provider_stock_categories.filter((value): value is string => typeof value === "string")
    : [];
  if (categories.length === 0) return;
  const parsed = parseGlobeNewswireUsSymbol(categories);
  if (parsed.status === "conflict") {
    metadata.provider_ticker_conflict = true;
    metadata.attribution_provider = "globenewswire_stock_category";
    return;
  }
  if (parsed.status !== "unique" || !parsed.symbol) return;
  const ticker = normalizeTicker(parsed.symbol);
  if (!ticker || !companies) return;
  const owners = companies.filter((company) => normalizeTicker(company.ticker) === ticker);
  if (owners.length !== 1) return;
  metadata.ticker = ticker;
  metadata.attribution_provider = "globenewswire_stock_category";
}

function decodeCategory(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}
