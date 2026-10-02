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
export type StockListingClass = "SUPPORTED_US_LISTING" | "FOREIGN_LISTING" | "INVALID_OR_NON_STOCK_METADATA";
export type StockListingOutcome = "supported_us" | "foreign_only" | "us_conflict" | "none";

export interface ClassifiedStockListings {
  usSymbols: string[];
  foreignListings: string[];
  outcome: StockListingOutcome;
}

/** Exchange:symbol values from the GlobeNewswire stock-category domain only. */
export function classifyGlobeNewswireStockCategories(categories: readonly string[]): ClassifiedStockListings {
  const usSymbols = new Set<string>();
  const foreignListings: string[] = [];
  for (const raw of categories) {
    const classified = classifyStockCategory(raw);
    if (classified.class === "SUPPORTED_US_LISTING" && classified.symbol) usSymbols.add(classified.symbol);
    if (classified.class === "FOREIGN_LISTING" && classified.listing) foreignListings.push(classified.listing);
  }
  if (usSymbols.size > 1) return { usSymbols: [...usSymbols], foreignListings, outcome: "us_conflict" };
  if (usSymbols.size === 1) return { usSymbols: [...usSymbols], foreignListings, outcome: "supported_us" };
  if (foreignListings.length > 0) return { usSymbols: [], foreignListings, outcome: "foreign_only" };
  return { usSymbols: [], foreignListings: [], outcome: "none" };
}

export function classifyStockCategory(raw: string): { class: StockListingClass; symbol: string | null; listing: string | null } {
  const match = raw.trim().match(/^([A-Za-z][A-Za-z0-9 .'-]*?)\s*:\s*([A-Za-z0-9.-]+)$/);
  if (!match) return { class: "INVALID_OR_NON_STOCK_METADATA", symbol: null, listing: null };
  const exchange = match[1].trim().replace(/\s+/g, " ");
  const symbol = match[2].trim().toUpperCase();
  const listing = `${exchange}:${symbol}`;
  if (US_EXCHANGE.test(exchange)) {
    if (!US_SYMBOL.test(symbol)) return { class: "INVALID_OR_NON_STOCK_METADATA", symbol: null, listing: null };
    return { class: "SUPPORTED_US_LISTING", symbol, listing };
  }
  if (exchange.length < 2 || !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) {
    return { class: "INVALID_OR_NON_STOCK_METADATA", symbol: null, listing: null };
  }
  return { class: "FOREIGN_LISTING", symbol: null, listing };
}

/** US exchange symbols only. Foreign listings are reported separately. Conflicting US symbols fail closed. */
export function parseGlobeNewswireUsSymbol(categories: readonly string[]): {
  status: GlobeNewswireSymbolStatus;
  symbol: string | null;
} {
  const classified = classifyGlobeNewswireStockCategories(categories);
  if (classified.outcome === "us_conflict") return { status: "conflict", symbol: null };
  if (classified.outcome === "supported_us") return { status: "unique", symbol: classified.usSymbols[0] ?? null };
  const sawInvalid = categories.some((value) => classifyStockCategory(value).class === "INVALID_OR_NON_STOCK_METADATA");
  if (classified.outcome === "none" && sawInvalid) return { status: "malformed", symbol: null };
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
  const parsed = classifyGlobeNewswireStockCategories(categories);
  if (parsed.outcome === "us_conflict") {
    metadata.provider_ticker_conflict = true;
    metadata.attribution_provider = "globenewswire";
    return;
  }
  if (parsed.outcome === "foreign_only") {
    metadata.provider_foreign_listing = true;
    metadata.provider_listings = parsed.foreignListings.slice(0, 8);
    metadata.attribution_provider = "globenewswire";
    return;
  }
  if (parsed.outcome !== "supported_us") return;
  const ticker = normalizeTicker(parsed.usSymbols[0]);
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
