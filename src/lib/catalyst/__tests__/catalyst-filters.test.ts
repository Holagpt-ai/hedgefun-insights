import { describe, expect, it } from "vitest";
import {
  catalystFeedCategoryForEvent,
  isEligibleCatalystFeedEvent,
  matchesCatalystFeedCategoryFilter,
} from "@/lib/catalyst/catalyst-filters";
import type { CatalystEvent } from "@/types/catalyst";

function baseEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "evt-1",
    symbol: "ACME",
    event_type: "sec_filing_news",
    provider: "sec_edgar",
    title: "Form 8-K — Item 2.02 Results of Operations",
    description: null,
    published_at: new Date().toISOString(),
    event_date: null,
    event_time: null,
    time_of_day: null,
    company_name: null,
    verification_state: "provider_reported",
    facts: { form_type: "8-K", sec_items: ["2.02"] },
    ...overrides,
  } as CatalystEvent;
}

describe("catalyst feed filters", () => {
  it("maps SEC 8-K Item 2.02 to Earnings for category chips", () => {
    const event = baseEvent();
    expect(catalystFeedCategoryForEvent(event)).toBe("EARNINGS");
    expect(matchesCatalystFeedCategoryFilter("earnings", event)).toBe(true);
    expect(matchesCatalystFeedCategoryFilter("sec_filings", event)).toBe(false);
  });

  it("SEC EDGAR source filter matches provider without raising feed scope", () => {
    const event = baseEvent();
    expect(matchesCatalystFeedCategoryFilter("sec_edgar", event)).toBe(true);
    expect(matchesCatalystFeedCategoryFilter("sec_edgar", baseEvent({ provider: "benzinga" }))).toBe(
      false,
    );
  });

  it("excludes invalidated attribution from feed eligibility", () => {
    expect(isEligibleCatalystFeedEvent(baseEvent())).toBe(true);
    expect(
      isEligibleCatalystFeedEvent(
        baseEvent({ verification_state: "attribution_invalidated" as CatalystEvent["verification_state"] }),
      ),
    ).toBe(false);
  });
});
