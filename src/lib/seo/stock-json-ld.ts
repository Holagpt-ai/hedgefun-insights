import { canonicalUrl } from "@/config/seo";

export function buildStockDetailJsonLd(input: {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
}): Record<string, unknown> {
  const symbol = input.symbol.trim().toUpperCase();
  const name = input.name?.trim() || symbol;
  const url = canonicalUrl(stockDetailCanonicalPath(symbol));
  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `${name} (${symbol})`,
    url,
    category: "Stock",
    provider: {
      "@type": "Organization",
      name: "Stocksist",
      url: canonicalUrl("/"),
    },
    ...(input.exchange ? { exchange: input.exchange } : {}),
  };
}

export function stockDetailCanonicalPath(symbol: string): string {
  return `/stocks/${encodeURIComponent(symbol.trim().toUpperCase())}`;
}
