import { describe, expect, it } from "vitest";
import { isCatalystFeedInitialLoading } from "@/lib/catalyst/catalyst-feed-loading";
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
});
