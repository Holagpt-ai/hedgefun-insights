import { describe, it, expect } from "vitest";
import { formatMarketDataTimestamp } from "@/components/screener/MarketDataStatus";

describe("formatMarketDataTimestamp", () => {
  it("formats UTC instants in America/New_York (EDT)", () => {
    expect(formatMarketDataTimestamp("2026-10-05T22:45:00.000Z")).toBe("Oct 5, 6:45 PM ET");
    expect(formatMarketDataTimestamp("2026-10-05T23:00:00.000Z")).toBe("Oct 5, 7:00 PM ET");
  });

  it("formats UTC instants in America/New_York (EST)", () => {
    expect(formatMarketDataTimestamp("2026-01-15T19:00:00.000Z")).toBe("Jan 15, 2:00 PM ET");
  });
});
