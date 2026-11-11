import { describe, expect, it } from "vitest";
import {
  filterCatalystEventsToSymbolContext,
  isCatalystFeedInitialLoading,
} from "@/lib/catalyst/catalyst-feed-loading";
import { clearCancelledEnrichmentInflight } from "@/lib/catalyst/catalyst-enrichment-request-tracking";
import {
  catalystEnrichmentStableKey,
  catalystEnrichmentSymbolsFromFeed,
} from "@/lib/catalyst/catalyst-enrichment-scheduling";

describe("Batch 220 catalyst loading helpers", () => {
  it("shows the feed while historical enrichment is still unrelated to initial fetch", () => {
    expect(isCatalystFeedInitialLoading(true, false)).toBe(true);
    expect(isCatalystFeedInitialLoading(true, true)).toBe(false);
    expect(isCatalystFeedInitialLoading(false, false)).toBe(false);
  });

  it("uses a stable enrichment key when client filters only reorder the same symbols", () => {
    const a = catalystEnrichmentStableKey(["ZZZ", "AAA", "MMM"]);
    const b = catalystEnrichmentStableKey(["MMM", "AAA", "ZZZ"]);
    expect(a).toBe(b);
    expect(a).toBe("AAA,MMM,ZZZ");
  });

  it("caps enrichment symbols at 24 in feed order", () => {
    const feed = Array.from({ length: 30 }, (_, i) => ({ symbol: `S${i}` }));
    const symbols = catalystEnrichmentSymbolsFromFeed(feed);
    expect(symbols).toHaveLength(24);
    expect(symbols[0]).toBe("S0");
    expect(symbols[23]).toBe("S23");
  });

  it("never renders AAPL events under an active TSLA symbol context", () => {
    const staleFromPriorQuery = [
      { symbol: "AAPL", id: "a1" },
      { symbol: "AAPL", id: "a2" },
    ];
    expect(filterCatalystEventsToSymbolContext(staleFromPriorQuery, "TSLA")).toEqual([]);
    expect(filterCatalystEventsToSymbolContext(staleFromPriorQuery, null)).toEqual(
      staleFromPriorQuery,
    );
  });

  it("clears in-flight enrichment so cancelled symbols can load again", () => {
    const inFlight = new Set(["NVDA", "TSLA"]);
    const completed = new Set(["TSLA"]);
    const interrupted = clearCancelledEnrichmentInflight(
      ["NVDA", "TSLA"],
      completed,
      inFlight,
    );
    expect(interrupted).toEqual(["NVDA"]);
    expect(inFlight.has("NVDA")).toBe(false);
    expect(inFlight.has("TSLA")).toBe(true);
  });
});
