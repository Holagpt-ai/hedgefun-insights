import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import {
  catalystSourceBadge,
  watchlistCatalystCounts,
  watchlistCatalystEmptyMessage,
} from "@/lib/catalyst/presentation";

function makeEvent(id: string, symbol: string): CatalystEvent {
  return {
    id,
    dedupe_key: `dedupe_${id}`,
    symbol,
    company_name: null,
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-09-07",
    event_time: null,
    time_of_day: null,
    title: `${symbol} news`,
    description: null,
    source_name: "Provider",
    source_url: null,
    provider: "polygon",
    related_symbols: [],
    facts: {},
    published_at: null,
  };
}

describe("catalystSourceBadge", () => {
  it("maps canonical provider ids to user-facing badges", () => {
    expect(catalystSourceBadge("earnings_calendar")).toBe("EARNINGS DATA");
    expect(catalystSourceBadge("polygon")).toBe("NEWS");
    expect(catalystSourceBadge("other_provider")).toBeNull();
  });
});

describe("watchlistCatalystCounts", () => {
  it("returns event count and distinct stock count", () => {
    const events = [
      makeEvent("e1", "TSLA"),
      makeEvent("e2", "TSLA"),
      makeEvent("e3", "AAPL"),
      makeEvent("e4", "MSFT"),
    ];
    const watchlist = new Set<string>(["TSLA", "AAPL"]);
    const out = watchlistCatalystCounts(events, watchlist);
    expect(out.events).toBe(3);
    expect(out.stocks).toBe(2);
  });
});

describe("watchlistCatalystEmptyMessage", () => {
  it("uses watchlist-empty messaging only when watchlist has no symbols", () => {
    expect(watchlistCatalystEmptyMessage(0)).toBe(
      "Your watchlist is empty. Add stocks to surface their catalysts here.",
    );
    expect(watchlistCatalystEmptyMessage(3)).toBe(
      "No recent catalysts match stocks in your watchlist.",
    );
  });
});
