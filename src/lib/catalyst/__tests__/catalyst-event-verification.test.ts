import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import { hydrateCatalystEventVerification } from "@/lib/catalyst/catalyst-event-verification";

function base(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "1",
    dedupe_key: "dk:1",
    symbol: "ABC",
    company_name: "ABC Corp",
    event_type: "product_contract",
    verification_state: "provider_reported",
    event_date: "2026-08-27",
    event_time: null,
    time_of_day: null,
    title: "ABC announces new contract with federal agency",
    description: null,
    source_name: "Press release",
    source_url: "https://example.com/a",
    provider: "polygon",
    related_symbols: ["ABC"],
    facts: {},
    published_at: "2026-08-27T14:00:00.000Z",
    ...overrides,
  };
}

describe("hydrateCatalystEventVerification", () => {
  it("reads attribution_class from persisted facts", () => {
    const row = base({
      facts: { attribution_class: "direct", attribution_reason: "title_ticker_primary" },
    });
    const hydrated = hydrateCatalystEventVerification(row);
    expect(hydrated.attribution_class).toBe("direct");
    expect(hydrated.ticker_specific).toBe(true);
  });

  it("marks earnings calendar rows as direct ticker-specific", () => {
    const row = base({
      provider: "earnings_calendar",
      title: "ABC Q2 earnings",
      facts: {},
    });
    const hydrated = hydrateCatalystEventVerification(row);
    expect(hydrated.attribution_class).toBe("direct");
    expect(hydrated.ticker_specific).toBe(true);
  });
});
