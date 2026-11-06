import type { CatalystEvent } from "@/types/catalyst";

const EDITORIAL_NEWS_SOURCE =
  /\b(?:motley\s*fool|seeking\s*alpha|benzinga|yahoo|reuters|bloomberg|cnbc|barron'?s|wall\s*street\s*journal|zacks|investor'?s?\s*business\s*daily|marketwatch|the\s*street)\b/i;

const PRESS_RELEASE_SOURCE =
  /\b(?:globe\s*newswire|globenewswire|business\s*wire|businesswire|pr\s*newswire|prnewswire|accesswire|newsfile|cision|press\s*release|investor\s+relations)\b/i;

export function isAuthoritativeIssuerProvider(provider: string | null | undefined): boolean {
  return (
    provider === "earnings_calendar" ||
    provider === "sec_edgar" ||
    provider === "company_ir" ||
    provider === "COMPANY_IR"
  );
}

export function isPressReleaseSource(input: {
  provider?: string | null;
  source_name?: string | null;
}): boolean {
  if (input.provider === "company_ir" || input.provider === "COMPANY_IR") return true;
  const source = input.source_name ?? "";
  if (!source.trim()) return false;
  if (EDITORIAL_NEWS_SOURCE.test(source)) return false;
  return PRESS_RELEASE_SOURCE.test(source);
}

/** Same wording as the shared attribution tiers. Kept here so card labels do not import the radar graph. */
export const RELATED_ISSUER_HEADLINE_LABEL = "Unverified association";
export const RELATED_SECTOR_HEADLINE_LABEL = "Related sector / market context";

/** True only when the row is this symbol's own event, not a related headline. */
export function isDirectIssuerCatalyst(input: {
  provider?: string | null;
  attribution_class?: CatalystEvent["attribution_class"];
  ticker_specific?: boolean | null;
}): boolean {
  if (input.attribution_class === "sector_related" || input.attribution_class === "unverified") return false;
  if (input.ticker_specific === false) return false;
  if (input.attribution_class === "direct" || input.attribution_class === "provider_associated") return true;
  return isAuthoritativeIssuerProvider(input.provider);
}

export function catalystSourceBadge(
  provider: string,
  sourceName?: string | null,
): "EARNINGS DATA" | "NEWS" | "SEC FILING" | "COMPANY IR" | "PRESS RELEASE" | null {
  if (provider === "earnings_calendar") return "EARNINGS DATA";
  if (provider === "polygon") return "NEWS";
  if (provider === "sec_edgar") return "SEC FILING";
  if (provider === "company_ir" || provider === "COMPANY_IR") return "COMPANY IR";
  if (provider === "news" || provider === "news_pr" || provider === "NEWS_PR") {
    return isPressReleaseSource({ provider, source_name: sourceName }) ? "PRESS RELEASE" : "NEWS";
  }
  return null;
}

export function watchlistCatalystCounts(
  events: readonly CatalystEvent[],
  watchlistSymbols: ReadonlySet<string>,
): { events: number; stocks: number } {
  let eventCount = 0;
  const distinctStocks = new Set<string>();
  for (const event of events) {
    if (!watchlistSymbols.has(event.symbol)) continue;
    eventCount += 1;
    distinctStocks.add(event.symbol);
  }
  return { events: eventCount, stocks: distinctStocks.size };
}

export function watchlistCatalystEmptyMessage(watchlistSize: number): string {
  if (watchlistSize === 0) {
    return "Your watchlist is empty. Add stocks to surface their catalysts here.";
  }
  return "No recent catalysts match stocks in your watchlist.";
}
