import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import {
  buildWatchlistPlatformContextMap,
  resolveWatchlistCatalystIntelStatus,
} from "@/lib/watchlist-v2/watchlist-catalyst-context";

const nowMs = Date.parse("2026-10-22T14:00:00.000Z");

function verifiedEvent(): CatalystEvent {
  return {
    id: "ev-1",
    dedupe_key: "k-1",
    symbol: "RUN",
    company_name: "Run Inc",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-10-22",
    event_time: null,
    time_of_day: null,
    title: "Headline",
    description: null,
    source_name: "PR",
    source_url: "https://example.com/run",
    provider: "news",
    related_symbols: [],
    facts: { intel_lifecycle: "announced" },
    published_at: "2026-10-22T13:00:00.000Z",
    attribution_class: "direct",
    ticker_specific: true,
  };
}

function entry(event: CatalystEvent): CatalystEnrichmentEntry {
  return { event, kind: "recent", sortMs: Date.parse(event.published_at ?? "") };
}

describe("Batch 34 — watchlist catalyst platform context", () => {
  it("keeps catalyst intel pending until enrichment resolves", () => {
    const pendingMap = buildWatchlistPlatformContextMap({
      symbols: ["AAA"],
      enrichment: undefined,
      queryPending: true,
      nowMs,
    });
    expect(pendingMap.size).toBe(0);
    expect(
      resolveWatchlistCatalystIntelStatus({
        platform: pendingMap.get("AAA"),
        catalystIntelPending: true,
      }),
    ).toBe("pending");
  });

  it("surfaces verified platform availability when enrichment returns verified event", () => {
    const enrichment = new Map([["RUN", entry(verifiedEvent())]]);
    const map = buildWatchlistPlatformContextMap({
      symbols: ["RUN"],
      enrichment,
      nowMs,
    });
    expect(resolveWatchlistCatalystIntelStatus({ platform: map.get("RUN") })).toBe("verified");
  });

  it("marks catalyst intel unavailable on enrichment query error", () => {
    expect(
      resolveWatchlistCatalystIntelStatus({
        catalystIntelError: true,
      }),
    ).toBe("unavailable");
  });
});
