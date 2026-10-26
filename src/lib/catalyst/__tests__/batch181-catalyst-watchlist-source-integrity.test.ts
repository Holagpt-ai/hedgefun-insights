import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import { attributeStory, dedupeStories } from "@/lib/catalyst/attribution";
import {
  buildCrossSurfaceSourceAttributionLine,
  catalystAttributionDisplayLabel,
  catalystEventSurfaceIdentity,
  resolveCatalystAttributionTier,
} from "@/lib/catalyst/catalyst-attribution-presentation";
import { hydrateCatalystEventVerification } from "@/lib/catalyst/catalyst-event-verification";
import { resolveRadarNewsDisplay } from "@/features/day-trade-radar-v2/radar-news-display";
import { formatWatchlistAlertFeedDetail } from "@/lib/watchlist-v2/watchlist-company-event-attribution";
import { buildActionFeed } from "@/lib/action-center/aggregate";

function event(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "ev-1",
    dedupe_key: "provider:abc",
    symbol: "NVDA",
    company_name: "NVIDIA Corporation",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-10-26",
    event_time: null,
    time_of_day: null,
    title: "Nvidia unveils next-generation AI accelerator, shares jump",
    description: null,
    source_name: "Reuters",
    source_url: "https://example.com/nvda-story",
    provider: "polygon",
    related_symbols: ["NVDA", "TSLA"],
    facts: { canonical_url: "https://example.com/nvda-story" },
    published_at: "2026-10-26T14:00:00.000Z",
    ...overrides,
  };
}

describe("Batch 181 — catalyst + watchlist source integrity", () => {
  it("does not attach an unrelated-company headline to another ticker", () => {
    const results = attributeStory({
      title: "Nvidia unveils next-generation AI accelerator, shares jump",
      tickers: [
        { symbol: "NVDA", companyName: "NVIDIA Corporation" },
        { symbol: "TSLA", companyName: "Tesla, Inc." },
      ],
    });
    expect(results.find((r) => r.symbol === "TSLA")?.ticker_specific).toBe(false);
  });

  it("classifies sector roundups as sector context, not direct catalysts", () => {
    const results = attributeStory({
      title: "Semiconductor stocks rally as chip demand improves",
      tickers: [{ symbol: "AMD", companyName: "Advanced Micro Devices" }],
    });
    expect(results[0]?.class).toBe("sector_related");
    expect(resolveCatalystAttributionTier({ attribution_class: "sector_related", ticker_specific: false }))
      .toBe("sector_context");
  });

  it("downgrades persisted direct facts when the live headline names another company", () => {
    const hydrated = hydrateCatalystEventVerification(
      event({
        symbol: "TSLA",
        company_name: "Tesla, Inc.",
        facts: { attribution_class: "direct", ticker_specific: true },
      }),
    );
    expect(hydrated.attribution_class).not.toBe("direct");
    expect(hydrated.ticker_specific).toBe(false);
  });

  it("keeps SEC rows authoritative when facts say direct", () => {
    const hydrated = hydrateCatalystEventVerification(
      event({
        provider: "sec_edgar",
        event_type: "sec_filing_news",
        title: "TSLA — Form 8-K",
        symbol: "TSLA",
        company_name: "Tesla, Inc.",
        facts: { attribution_class: "direct", ticker_specific: true },
      }),
    );
    expect(hydrated.attribution_class).toBe("direct");
    expect(hydrated.ticker_specific).toBe(true);
  });

  it("dedupes duplicate source events by surface identity", () => {
    const a = event({ id: "a", dedupe_key: "provider:dup" });
    const b = event({ id: "b", dedupe_key: "provider:dup" });
    expect(catalystEventSurfaceIdentity(a)).toBe(catalystEventSurfaceIdentity(b));
    const stories = dedupeStories([
      { id: "1", title: a.title, source_url: a.source_url, dedupe_key: a.dedupe_key },
      { id: "2", title: b.title, source_url: b.source_url, dedupe_key: b.dedupe_key },
    ]);
    expect(stories).toHaveLength(1);
  });

  it("labels missing publication timestamps on source lines", () => {
    const line = buildCrossSurfaceSourceAttributionLine(
      event({ published_at: null, facts: { published_at_unavailable: true } }),
    );
    expect(line).toMatch(/Publication time unavailable/);
    expect(line).toMatch(/Reuters/);
  });

  it("does not show a mismatched provider headline on the Radar recent-news tier", () => {
    const display = resolveRadarNewsDisplay(
      "TSLA",
      undefined,
      {
        ticker: "TSLA",
        title: "Nvidia unveils next-generation AI accelerator, shares jump",
        publishedAt: "2026-10-26T14:00:00.000Z",
        url: "https://example.com/nvda",
        source: "Reuters",
        provider: "finnhub",
      },
    );
    expect(display.level).toBe("none");
  });

  it("labels watchlist company_event alerts when the headline names another company", () => {
    const detail = formatWatchlistAlertFeedDetail({
      ticker: "TSLA",
      reason: "Nvidia unveils next-generation AI accelerator, shares jump",
      alertType: "company_event",
      companyName: "Tesla, Inc.",
    });
    expect(detail).toMatch(/Unverified association for TSLA/);
  });

  it("uses consistent verified-catalyst labels across presentation helpers", () => {
    expect(
      catalystAttributionDisplayLabel({
        event: { attribution_class: "direct", ticker_specific: true },
        radarAssociation: "confirmed_current",
      }),
    ).toBe("Verified catalyst");
    expect(
      catalystAttributionDisplayLabel({
        event: { attribution_class: "direct", ticker_specific: true },
        radarAssociation: "historical_context",
      }),
    ).toBe("Historical catalyst context");
  });

  it("feeds watchlist alerts through the same headline attribution gate", () => {
    const nowMs = Date.parse("2026-10-26T17:00:00.000Z");
    const feed = buildActionFeed({
      scannerAlerts: [],
      alerts: [
        {
          id: "wa-1",
          ticker: "TSLA",
          alert_type: "company_event",
          reason: "Nvidia unveils next-generation AI accelerator, shares jump",
          facts: { company_name: "Tesla, Inc." },
          event_time: new Date(nowMs).toISOString(),
          session_date: "2026-10-26",
          dedupe_key: "wa-1",
          created_at: new Date(nowMs).toISOString(),
        },
      ],
      catalyst: [],
      savedEventIds: new Set(),
      reviewedEventIds: new Set(),
      dismissedScannerAlertIds: new Set(),
      openTrades: [],
      nowMs,
    });
    const item = feed.find((f) => f.source === "watchlist_alert");
    expect(item?.detail).toMatch(/Unverified association for TSLA/);
  });
});
