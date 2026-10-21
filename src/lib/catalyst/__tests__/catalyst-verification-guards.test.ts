import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import {
  isFutureScheduledOnly,
  passesDirectCatalystVerificationGuard,
  passesRecentEnrichmentGuard,
} from "@/lib/catalyst/catalyst-verification-guards";

function event(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "1",
    dedupe_key: "k",
    symbol: "AAA",
    company_name: "AAA",
    event_type: "earnings",
    verification_state: "provider_reported",
    event_date: "2026-12-01",
    event_time: null,
    time_of_day: null,
    title: "AAA earnings",
    description: null,
    source_name: "Provider",
    source_url: "https://example.com/a",
    provider: "test",
    related_symbols: [],
    facts: {},
    published_at: null,
    ...overrides,
  };
}

describe("catalyst verification guards", () => {
  const nowMs = Date.parse("2026-09-22T15:00:00.000Z");

  it("treats future schedule-only rows as not confirmed announcements", () => {
    expect(isFutureScheduledOnly(event(), nowMs)).toBe(true);
    expect(passesRecentEnrichmentGuard(event(), nowMs)).toBe(false);
  });

  it("allows recent rows with publication evidence", () => {
    const published = event({
      published_at: "2026-09-22T14:00:00.000Z",
      event_date: "2026-09-22",
    });
    expect(passesRecentEnrichmentGuard(published, nowMs)).toBe(true);
  });

  it("blocks sector and unverified attribution", () => {
    expect(passesDirectCatalystVerificationGuard(event({ attribution_class: "unverified" }), nowMs)).toBe(false);
    expect(passesDirectCatalystVerificationGuard(event({ ticker_specific: false }), nowMs)).toBe(false);
  });

  it("blocks intel UNVERIFIED verification state", () => {
    expect(
      passesDirectCatalystVerificationGuard(
        event({ facts: { intel_verification: "UNVERIFIED" } }),
        nowMs,
      ),
    ).toBe(false);
  });

  it("allows announced lifecycle from intel facts", () => {
    const announced = event({
      event_date: "2026-12-01",
      facts: { intel_lifecycle: "announced" },
    });
    expect(isFutureScheduledOnly(announced, nowMs)).toBe(false);
  });
});
