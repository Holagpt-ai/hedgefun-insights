import { describe, expect, it } from "vitest";
import {
  classifyAgeAgainstStaleBoundary,
  formatMarketDataTrustLine,
  PRE_MARKET_INDEX_STALE_MS,
  PRE_MARKET_SCREENER_STALE_MS,
  resolvePreMarketSectionTrust,
  resolveScreenerMarketDataTrust,
  resolveWatchlistMarketDataTrust,
  SCREENER_GENERATION_STALE_AFTER_MS,
  WATCHLIST_SNAPSHOT_STALE_MS,
} from "@/lib/market-data/trust-states";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";

const NOW = Date.parse("2026-09-29T18:00:00.000Z");
const ISO = (offsetMs: number) => new Date(NOW - offsetMs).toISOString();

describe("classifyAgeAgainstStaleBoundary", () => {
  it("within boundary -> Fresh (no invented Delayed band)", () => {
    expect(
      classifyAgeAgainstStaleBoundary(6 * 60_000, SCREENER_GENERATION_STALE_AFTER_MS),
    ).toBe("FRESH");
    expect(
      classifyAgeAgainstStaleBoundary(10 * 60_000, PRE_MARKET_INDEX_STALE_MS),
    ).toBe("FRESH");
  });

  it("beyond stale boundary -> Stale", () => {
    expect(
      classifyAgeAgainstStaleBoundary(
        SCREENER_GENERATION_STALE_AFTER_MS + 1,
        SCREENER_GENERATION_STALE_AFTER_MS,
      ),
    ).toBe("STALE");
  });

  it("null age -> Unavailable", () => {
    expect(classifyAgeAgainstStaleBoundary(null, PRE_MARKET_INDEX_STALE_MS)).toBe(
      "UNAVAILABLE",
    );
  });
});

describe("resolveWatchlistMarketDataTrust", () => {
  const validThrough = new Date(NOW + 60 * 60_000).toISOString();

  it("valid snapshot under 45m contract -> Fresh", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough,
        snapshotTsMs: NOW - 6 * 60_000,
        nowMs: NOW,
      }),
    ).toBe("FRESH");
  });

  it("expired valid_through -> Stale", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: ISO(60_000),
        snapshotTsMs: NOW - 2 * 60_000,
        nowMs: NOW,
      }),
    ).toBe("STALE");
  });

  it("snapshot older than STALE_MS -> Stale", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough,
        snapshotTsMs: NOW - WATCHLIST_SNAPSHOT_STALE_MS - 1,
        nowMs: NOW,
      }),
    ).toBe("STALE");
  });

  it("missing snapshot -> Unavailable", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough,
        snapshotTsMs: null,
        nowMs: NOW,
      }),
    ).toBe("UNAVAILABLE");
  });

  it("explicit last_completed presentation -> Delayed", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough,
        snapshotTsMs: NOW - 6 * 60_000,
        analysisPresentation: "last_completed",
        nowMs: NOW,
      }),
    ).toBe("DELAYED");
  });
});

describe("resolvePreMarketSectionTrust", () => {
  it("available section within index stale window -> Fresh", () => {
    expect(
      resolvePreMarketSectionTrust(
        { status: "available", as_of: ISO(15 * 60_000), reason_code: null },
        PRE_MARKET_INDEX_STALE_MS,
        NOW,
      ),
    ).toBe("FRESH");
  });

  it("server stale status -> Stale", () => {
    expect(
      resolvePreMarketSectionTrust(
        { status: "stale", as_of: ISO(60_000), reason_code: "SOURCE_STALE" },
        PRE_MARKET_INDEX_STALE_MS,
        NOW,
      ),
    ).toBe("STALE");
  });

  it("beyond screener stale minutes while still available -> Stale", () => {
    expect(
      resolvePreMarketSectionTrust(
        { status: "available", as_of: ISO(31 * 60_000), reason_code: null },
        PRE_MARKET_SCREENER_STALE_MS,
        NOW,
      ),
    ).toBe("STALE");
  });

  it("REFRESH_UNAVAILABLE stale section -> Delayed (last validated)", () => {
    expect(
      resolvePreMarketSectionTrust(
        {
          status: "stale",
          as_of: ISO(60_000),
          reason_code: "REFRESH_UNAVAILABLE",
        },
        PRE_MARKET_INDEX_STALE_MS,
        NOW,
      ),
    ).toBe("DELAYED");
  });

  it("missing as_of -> Unavailable", () => {
    expect(
      resolvePreMarketSectionTrust(
        { status: "available", as_of: null, reason_code: null },
        PRE_MARKET_INDEX_STALE_MS,
        NOW,
      ),
    ).toBe("UNAVAILABLE");
  });
});

describe("resolveScreenerMarketDataTrust", () => {
  it("honors generation stale status", () => {
    expect(
      resolveScreenerMarketDataTrust({
        status: "stale",
        syncedAt: ISO(60_000),
        nowMs: NOW,
      }),
    ).toBe("STALE");
  });

  it("delayed feed telemetry -> Delayed", () => {
    const feed: MarketFeedTelemetry = {
      provider: "polygon",
      feed_mode: "delayed",
      market_timestamp: ISO(60_000),
      received_at: ISO(30_000),
      latency_ms: 30_000,
      connection_state: "subscribed",
      last_message_at: ISO(30_000),
      stale: false,
    };
    expect(
      resolveScreenerMarketDataTrust({
        status: "available",
        syncedAt: ISO(3 * 60_000),
        marketFeed: feed,
        nowMs: NOW,
      }),
    ).toBe("DELAYED");
  });

  it("generation fallback within 20m -> Fresh (not Delayed at 6m)", () => {
    expect(
      resolveScreenerMarketDataTrust({
        status: "available",
        syncedAt: ISO(6 * 60_000),
        nowMs: NOW,
      }),
    ).toBe("FRESH");
  });

  it("generation fallback beyond 20m -> Stale", () => {
    expect(
      resolveScreenerMarketDataTrust({
        status: "available",
        syncedAt: ISO(SCREENER_GENERATION_STALE_AFTER_MS + 60_000),
        nowMs: NOW,
      }),
    ).toBe("STALE");
  });

  it("no trustworthy timestamp -> Unavailable", () => {
    expect(
      resolveScreenerMarketDataTrust({
        status: "available",
        syncedAt: null,
        nowMs: NOW,
      }),
    ).toBe("UNAVAILABLE");
  });
});

describe("formatMarketDataTrustLine", () => {
  it("formats fresh with relative update", () => {
    expect(formatMarketDataTrustLine("FRESH", ISO(2 * 60_000), NOW)).toBe(
      "Fresh · updated 2m ago",
    );
  });

  it("unavailable has no fabricated age", () => {
    expect(formatMarketDataTrustLine("UNAVAILABLE", null, NOW)).toBe(
      "Unavailable",
    );
  });
});
