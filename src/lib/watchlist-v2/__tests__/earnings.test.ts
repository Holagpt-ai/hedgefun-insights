import { describe, it, expect } from "vitest";
import {
  classifyEarningsEvent,
  formatEarningsCountdownLabel,
  selectNearestEarnings,
} from "@/lib/watchlist-v2/earnings";
import type { CatalystEvent } from "@/types/catalyst";

function evt(overrides: Partial<CatalystEvent>): CatalystEvent {
  return {
    id: "1",
    dedupe_key: "1",
    symbol: "AAPL",
    company_name: "Apple",
    event_type: "earnings",
    verification_state: "provider_reported",
    event_date: "2026-08-05",
    event_time: null,
    time_of_day: null,
    title: "Apple earnings",
    description: null,
    source_name: "Provider",
    source_url: null,
    provider: "test",
    related_symbols: [],
    facts: {},
    published_at: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("watchlist earnings countdown", () => {
  const now = Date.parse("2026-07-31T16:00:00.000Z");

  it("uses scheduled date not older published_at", () => {
    const c = classifyEarningsEvent(
      evt({ event_date: "2026-08-03", published_at: "2026-07-01T12:00:00.000Z" }),
      now,
    );
    expect(c).not.toBeNull();
    expect(c!.kind).toBe("upcoming");
  });

  it("formats Today / Tomorrow / Nd and Reported Nd ago", () => {
    // ET calendar: 2026-07-31
    expect(formatEarningsCountdownLabel("upcoming", Date.parse("2026-07-31T16:00:00Z"), now)).toBe(
      "Earnings Today",
    );
    expect(formatEarningsCountdownLabel("upcoming", Date.parse("2026-08-01T16:00:00Z"), now)).toBe(
      "Earnings Tomorrow",
    );
    expect(formatEarningsCountdownLabel("upcoming", Date.parse("2026-08-04T16:00:00Z"), now)).toBe(
      "Earnings in 4d",
    );
    expect(formatEarningsCountdownLabel("recent", Date.parse("2026-07-29T16:00:00Z"), now)).toBe(
      "Reported 2d ago",
    );
  });

  it("selects nearest upcoming earnings deterministically", () => {
    const map = selectNearestEarnings(
      [
        evt({ id: "far", symbol: "USEA", event_date: "2026-08-10", title: "Far" }),
        evt({ id: "near", symbol: "USEA", event_date: "2026-08-03", title: "Near" }),
      ],
      ["USEA"],
      now,
    );
    expect(map.get("USEA")?.event.title).toBe("Near");
  });

  it("ignores non-earnings and unverified rows", () => {
    expect(
      classifyEarningsEvent(
        evt({ event_type: "company_news" }),
        now,
      ),
    ).toBeNull();
  });
});
