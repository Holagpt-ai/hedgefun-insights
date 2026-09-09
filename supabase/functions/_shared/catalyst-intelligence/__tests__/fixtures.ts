import type { NormalizedCatalystInput } from "../types.ts";

const NOW = Date.parse("2026-09-08T14:00:00.000Z");

export function nowMs(): number {
  return NOW;
}

export function baseRow(
  overrides: Partial<NormalizedCatalystInput> = {},
): NormalizedCatalystInput {
  return {
    id: "evt-1",
    dedupe_key: "polygon:art-1:AAPL",
    symbol: "AAPL",
    company_name: "Apple Inc.",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-09-08",
    event_time: "2026-09-08T13:00:00.000Z",
    time_of_day: null,
    title: "Apple names new VP of engineering",
    description: null,
    source_name: "Reuters",
    source_url: "https://example.com/aapl-vp",
    provider: "polygon",
    provider_article_id: "art-1",
    related_symbols: [],
    facts: {
      attribution_class: "direct",
      attribution_reason: "title_ticker_primary",
    },
    published_at: "2026-09-08T13:00:00.000Z",
    ...overrides,
  };
}

export function opinionHeadline(): NormalizedCatalystInput {
  return baseRow({
    dedupe_key: "polygon:art-op:AAPL",
    title: "Is AAPL still a buy after this week's rally?",
    description: "Should you buy, hold, or sell Apple here?",
    event_type: "company_news",
    facts: {
      attribution_class: "direct",
      attribution_reason: "title_ticker_primary",
      ticker_specific: true,
    },
  });
}

export function secEightK(): NormalizedCatalystInput {
  return {
    id: "sec-1",
    dedupe_key: "sec:0001045810-26-000001:NVDA",
    symbol: "NVDA",
    company_name: "NVIDIA CORP",
    event_type: "sec_filing_news",
    verification_state: "provider_reported",
    event_date: "2026-09-07",
    event_time: "2026-09-07T17:17:00.000Z",
    time_of_day: null,
    title: "NVDA filed Form 8-K",
    description: "Form 8-K — Items 2.02, 5.02 and 9.01",
    source_name: "SEC EDGAR",
    source_url:
      "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/0001045810-26-000001-index.htm",
    provider: "sec_edgar",
    provider_article_id: "0001045810-26-000001",
    related_symbols: [],
    facts: {
      source_kind: "sec_filing",
      form_type: "8-K",
      cik: "0001045810",
      accession_number: "0001045810-26-000001",
      filing_date: "2026-09-07",
      accepted_at: "2026-09-07T17:17:00.000Z",
      report_date: null,
      primary_document: null,
      sec_items: ["2.02", "5.02", "9.01"],
      exchange: "Nasdaq",
    },
    published_at: "2026-09-07T17:17:00.000Z",
  };
}

export function fdaApproval(): NormalizedCatalystInput {
  return baseRow({
    id: "fda-1",
    dedupe_key: "polygon:art-fda:MRNA",
    symbol: "MRNA",
    company_name: "Moderna Inc.",
    event_type: "fda_biotech",
    title: "FDA approves Moderna RSV vaccine",
    description: "The FDA approved the company's biologics license application.",
    source_url: "https://example.com/mrna-fda",
    provider_article_id: "art-fda",
    facts: {
      attribution_class: "direct",
      attribution_reason: "title_entity_primary",
      ticker_specific: true,
    },
  });
}

export function earningsCalendar(): NormalizedCatalystInput {
  return {
    id: "earn-1",
    dedupe_key: "earnings:AAPL:2026-09-09",
    symbol: "AAPL",
    company_name: "Apple Inc.",
    event_type: "earnings",
    verification_state: "provider_reported",
    event_date: "2026-09-09",
    event_time: null,
    time_of_day: "after_close",
    title: "Apple Inc. earnings",
    description: null,
    source_name: "Earnings Calendar",
    source_url: null,
    provider: "earnings_calendar",
    provider_article_id: null,
    related_symbols: [],
    facts: {
      estimate_eps: 1.52,
      actual_eps: 1.64,
      surprise_percent: 7.9,
    },
    published_at: null,
  };
}

export function unknownProviderHardLooking(): NormalizedCatalystInput {
  return baseRow({
    dedupe_key: "wire:xyz:AAPL",
    provider: "mystery_wire",
    title: "FDA approves mystery-wire exclusive for Apple",
    event_type: "fda_biotech",
    facts: {
      attribution_class: "direct",
      ticker_specific: true,
    },
  });
}
