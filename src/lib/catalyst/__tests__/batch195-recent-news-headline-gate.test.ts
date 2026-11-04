import { describe, expect, it } from "vitest";
import { headlineQualifiesForTickerScopedNews } from "@/lib/catalyst/attribution";
import { hydrateCatalystEventVerification } from "@/lib/catalyst/catalyst-event-verification";
import type { CatalystEvent } from "@/types/catalyst";

function recentNewsInput(
  symbol: string,
  companyName: string,
  title: string,
): Parameters<typeof headlineQualifiesForTickerScopedNews>[0] {
  return {
    title,
    symbol,
    companyName,
    providerTickers: [symbol],
    providerAssociatesSymbol: true,
  };
}

describe("Batch 195 — recent-news headline gate", () => {
  it("blocks SpaceX-primary commentary on TSLA", () => {
    expect(
      headlineQualifiesForTickerScopedNews(
        recentNewsInput(
          "TSLA",
          "Tesla, Inc.",
          "Up Nearly 30% in August, Is SpaceX Stock Still a Buy?",
        ),
      ),
    ).toBe(false);
  });

  it("allows valid TSLA-specific provider news", () => {
    expect(
      headlineQualifiesForTickerScopedNews(
        recentNewsInput(
          "TSLA",
          "Tesla, Inc.",
          "Tesla reports record Q3 vehicle deliveries",
        ),
      ),
    ).toBe(true);
  });

  it("allows valid ORCL-specific provider news", () => {
    expect(
      headlineQualifiesForTickerScopedNews(
        recentNewsInput(
          "ORCL",
          "Oracle Corporation",
          "Oracle raises cloud guidance after fiscal Q2 earnings beat",
        ),
      ),
    ).toBe(true);
  });

  it("excludes sector roundups and unrelated-company headlines", () => {
    expect(
      headlineQualifiesForTickerScopedNews(
        recentNewsInput(
          "AMD",
          "Advanced Micro Devices",
          "Semiconductor stocks rally as chip demand improves",
        ),
      ),
    ).toBe(false);
    expect(
      headlineQualifiesForTickerScopedNews(
        recentNewsInput(
          "TSLA",
          "Tesla, Inc.",
          "Nvidia unveils next-generation AI accelerator, shares jump",
        ),
      ),
    ).toBe(false);
    expect(
      headlineQualifiesForTickerScopedNews(
        recentNewsInput(
          "TSLA",
          "Tesla, Inc.",
          "Tesla vs SpaceX: Which Is the Better Stock to Buy?",
        ),
      ),
    ).toBe(false);
  });

  it("leaves SEC authoritative hydration unchanged", () => {
    const hydrated = hydrateCatalystEventVerification({
      id: "sec-1",
      dedupe_key: "sec:1",
      symbol: "TSLA",
      company_name: "Tesla, Inc.",
      event_type: "sec_filing_news",
      verification_state: "provider_reported",
      event_date: "2026-11-04",
      event_time: null,
      time_of_day: null,
      title: "TSLA — Form 8-K",
      description: null,
      source_name: "SEC EDGAR",
      source_url: "https://www.sec.gov/example",
      provider: "sec_edgar",
      related_symbols: ["TSLA"],
      facts: { attribution_class: "direct", ticker_specific: true },
      published_at: "2026-11-04T14:00:00.000Z",
    } satisfies CatalystEvent);
    expect(hydrated.attribution_class).toBe("direct");
    expect(hydrated.ticker_specific).toBe(true);
  });
});
