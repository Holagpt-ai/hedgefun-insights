import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import { buildSymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";

describe("catalyst platform context", () => {
  it("returns verified context with graph when enrichment passes guards", () => {
    const event: CatalystEvent = {
      id: "1",
      dedupe_key: "k",
      symbol: "AAA",
      company_name: "AAA",
      event_type: "product_contract",
      verification_state: "provider_reported",
      event_date: "2026-09-22",
      event_time: null,
      time_of_day: null,
      title: "Deal",
      description: null,
      source_name: "PR",
      source_url: "https://example.com",
      provider: "news",
      related_symbols: [],
      facts: { intel_lifecycle: "announced" },
      published_at: "2026-09-22T12:00:00.000Z",
      attribution_class: "direct",
      ticker_specific: true,
    };
    const ctx = buildSymbolCatalystPlatformContext({
      symbol: "AAA",
      entry: { event, kind: "recent", sortMs: Date.parse("2026-09-22T12:00:00.000Z") },
      availability: "verified",
      nowMs: Date.parse("2026-09-22T15:00:00.000Z"),
    });
    expect(ctx.availability).toBe("verified");
    expect(ctx.graph?.nodes.length).toBeGreaterThan(2);
    expect(ctx.catalystPath).toContain("AAA");
  });
});
