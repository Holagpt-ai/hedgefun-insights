import { attributeSymbol, normalizeSymbol } from "@/lib/catalyst/attribution";
import { boundWatchlistUserFacingText } from "@/lib/watchlist-v2/signal-assertion-provenance";

export function watchlistHeadlineMatchesTicker(input: {
  ticker: string;
  headline: string;
  companyName?: string | null;
}): boolean {
  const symbol = normalizeSymbol(input.ticker);
  const headline = input.headline.trim();
  if (!symbol || !headline) return false;
  const attr = attributeSymbol({
    title: headline,
    symbol,
    companyName: input.companyName ?? null,
    providerTickers: [symbol],
    providerAssociatesSymbol: true,
  });
  return attr.ticker_specific && (attr.class === "direct" || attr.class === "provider_associated");
}

export function formatWatchlistAlertFeedDetail(input: {
  ticker: string;
  reason: string;
  alertType: string;
  companyName?: string | null;
  sourceName?: string | null;
  providerHeadline?: string | null;
}): string {
  const reason = input.reason.trim();
  if (input.alertType !== "company_event" || !reason) {
    return reason;
  }
  const headline = (input.providerHeadline ?? reason).trim();
  const bounded = boundWatchlistUserFacingText(headline, { sourceName: input.sourceName });
  if (watchlistHeadlineMatchesTicker({
    ticker: input.ticker,
    headline,
    companyName: input.companyName,
  })) {
    return bounded;
  }
  const sym = normalizeSymbol(input.ticker) ?? input.ticker.toUpperCase();
  return (
    `Unverified association for ${sym}: headline names another company or sector context. `
    + `${bounded}`
  );
}
