/**
 * Permitted US macro release catalog with authoritative schedule links (no values fabricated).
 * Used when Finnhub economic entitlement is disabled or unverified.
 */

export type UsEconomicReleaseCatalogEntry = {
  event_name: string;
  country: "US";
  importance: "high" | "medium" | "low";
  source: string;
  source_url: string;
  schedule_note: string;
};

export const US_ECONOMIC_RELEASE_CATALOG: readonly UsEconomicReleaseCatalogEntry[] = [
  {
    event_name: "Consumer Price Index (CPI)",
    country: "US",
    importance: "high",
    source: "U.S. Bureau of Labor Statistics",
    source_url: "https://www.bls.gov/schedule/news_release/cpi.htm",
    schedule_note: "Monthly release; typically mid-month morning ET.",
  },
  {
    event_name: "Employment Situation (Nonfarm Payrolls)",
    country: "US",
    importance: "high",
    source: "U.S. Bureau of Labor Statistics",
    source_url: "https://www.bls.gov/schedule/news_release/empsit.htm",
    schedule_note: "Monthly release; first Friday morning ET.",
  },
  {
    event_name: "Gross Domestic Product (Advance Estimate)",
    country: "US",
    importance: "high",
    source: "U.S. Bureau of Economic Analysis",
    source_url: "https://www.bea.gov/news/schedule",
    schedule_note: "Quarterly advance estimate; see BEA news schedule.",
  },
  {
    event_name: "FOMC Statement",
    country: "US",
    importance: "high",
    source: "Board of Governors of the Federal Reserve System",
    source_url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    schedule_note: "Scheduled meeting dates published on Federal Reserve calendar.",
  },
  {
    event_name: "Retail Sales",
    country: "US",
    importance: "medium",
    source: "U.S. Census Bureau",
    source_url: "https://www.census.gov/retail/index.html",
    schedule_note: "Monthly release; see Census advance monthly sales calendar.",
  },
] as const;

export function summarizeUsFallbackCatalog(): string {
  return US_ECONOMIC_RELEASE_CATALOG.map((e) => `${e.event_name} (${e.source_url})`).join("; ");
}