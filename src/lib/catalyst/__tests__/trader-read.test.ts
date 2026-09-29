import { describe, expect, it } from "vitest";
import { buildCatalystTraderRead } from "@/lib/catalyst/trader-read";
import type { CatalystEvent } from "@/types/catalyst";

function event(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "1",
    dedupe_key: "k",
    symbol: "AAA",
    company_name: null,
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-09-26",
    event_time: "2026-09-26T13:00:00Z",
    time_of_day: "during",
    title: "AAA names a new customer",
    description: "The filing lists a customer agreement.",
    source_name: "SEC",
    source_url: "https://example.test/filing",
    provider: "sec_edgar",
    related_symbols: [],
    facts: {},
    published_at: "2026-09-26T13:05:00Z",
    ticker_specific: true,
    ...overrides,
  };
}

describe("catalyst trader read", () => {
  it("uses stored title, source, and timing and does not invent a score", () => {
    const lines = buildCatalystTraderRead(event());
    const labels = lines.map((line) => line.label);
    expect(labels).toEqual(["Catalyst", "Evidence", "Timing"]);
    expect(lines[0]?.text).toBe("AAA names a new customer");
    expect(lines[1]?.text).toContain("SEC");
    expect(lines[1]?.text).toContain("Ticker-specific");
    expect(lines[1]?.text).toContain("The filing lists a customer agreement.");
    expect(lines[2]?.text).toContain("2026-09-26");
    expect(JSON.stringify(lines)).not.toMatch(/score|RUNNING_UP|market reaction/i);
  });

  it("omits evidence that is not on the event", () => {
    const lines = buildCatalystTraderRead(event({
      description: null,
      published_at: null,
      event_time: null,
      time_of_day: null,
      ticker_specific: null,
      facts: {},
    }));
    expect(lines.find((line) => line.label === "Evidence")?.text).toBe("SEC · Provider reported");
    expect(lines.find((line) => line.label === "Timing")?.text).toBe("2026-09-26");
    expect(lines.some((line) => line.label === "Market Reaction" as string)).toBe(false);
  });
});
