import { describe, expect, it } from "vitest";
import { HOMEPAGE_V21_HEADLINE, HOMEPAGE_V21_INDEX_SYMBOLS } from "@/config/homepage-v21";
import { filterCatalystEventsForDay } from "@/lib/homepage/calendar-events";
import type { CatalystEvent } from "@/types/catalyst";

describe("Homepage V21 config", () => {
  it("uses the approved hero headline", () => {
    expect(HOMEPAGE_V21_HEADLINE).toBe("Stock Market Intelligence for Every Investor");
  });

  it("lists exactly ten index proxy symbols", () => {
    expect(HOMEPAGE_V21_INDEX_SYMBOLS).toHaveLength(10);
  });
});

describe("homepage calendar event contract", () => {
  const sample: CatalystEvent = {
    id: "ev-1",
    dedupe_key: "k1",
    symbol: "AAPL",
    company_name: "Apple",
    event_type: "earnings",
    verification_state: "provider_reported",
    event_date: "2026-11-26",
    event_time: "16:00",
    time_of_day: "after_close",
    title: "Q4 earnings",
    description: null,
    source_name: "Finnhub",
    source_url: null,
    provider: "finnhub",
    related_symbols: [],
    facts: {},
    published_at: null,
  };

  it("routes earnings to the earnings tab only", () => {
    const earnings = filterCatalystEventsForDay([sample], "2026-11-26", "earnings");
    expect(earnings).toHaveLength(1);
    const catalyst = filterCatalystEventsForDay([sample], "2026-11-26", "catalyst");
    expect(catalyst).toHaveLength(0);
  });
});