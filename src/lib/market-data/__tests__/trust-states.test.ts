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

  it("last completed session is Closed even when the snapshot is older than the live stale window", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough,
        snapshotTsMs: NOW - 6 * 60_000,
        analysisPresentation: "last_completed",
        nowMs: NOW,
      }),
    ).toBe("CLOSED");
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough,
        snapshotTsMs: NOW - 3 * 24 * 60 * 60_000,
        analysisPresentation: "last_completed",
        nowMs: NOW,
      }),
    ).toBe("CLOSED");
  });

  // ── Session-aware closed-market freshness (Repair #9) ─────────────────────

  const friSession = "2026-09-25";
  const friCloseEt = Date.parse("2026-09-25T20:00:00Z"); // ~16:00 ET
  const satMorning = Date.parse("2026-09-26T14:00:00Z");
  const friLateNight = Date.parse("2026-09-26T02:00:00Z"); // Fri 22:00 ET
  const thuSession = "2026-09-24";
  const thuCloseEt = Date.parse("2026-09-24T20:00:00Z");
  const holidayMidday = Date.parse("2026-07-03T16:00:00Z"); // Jul 3 holiday ~ noon ET
  const priorSessionClose = Date.parse("2026-07-02T20:00:00Z"); // Jul 2 ~16:00 ET
  const premarketStaleNow = Date.parse("2026-09-29T10:00:00Z"); // Tue ~06:00 ET
  const afterHoursStaleNow = Date.parse("2026-09-29T22:00:00Z"); // Tue ~18:00 ET

  const closedValidThrough = (nowMs: number) =>
    new Date(nowMs + 60 * 60_000).toISOString();

  it("CASE C — after market close: live presentation + last-session snapshot -> Closed (not Stale)", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: closedValidThrough(friLateNight),
        snapshotTsMs: friCloseEt,
        analysisPresentation: "live",
        analysisSessionDate: friSession,
        nowMs: friLateNight,
      }),
    ).toBe("CLOSED");
  });

  it("CASE D — weekend: Friday session snapshot -> Closed", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: closedValidThrough(satMorning),
        snapshotTsMs: friCloseEt,
        analysisPresentation: "live",
        analysisSessionDate: friSession,
        nowMs: satMorning,
      }),
    ).toBe("CLOSED");
  });

  it("CASE E — holiday: prior trading session snapshot -> Closed", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: closedValidThrough(holidayMidday),
        snapshotTsMs: priorSessionClose,
        analysisPresentation: "live",
        analysisSessionDate: "2026-07-02",
        nowMs: holidayMidday,
      }),
    ).toBe("CLOSED");
  });

  it("CASE F — closed window but snapshot predates expected session -> Stale", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: closedValidThrough(satMorning),
        snapshotTsMs: thuCloseEt,
        analysisPresentation: "live",
        analysisSessionDate: thuSession,
        nowMs: satMorning,
      }),
    ).toBe("STALE");
  });

  it("CASE G — premarket: quote older than stale window -> Stale", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: closedValidThrough(premarketStaleNow),
        snapshotTsMs: premarketStaleNow - WATCHLIST_SNAPSHOT_STALE_MS - 1,
        analysisPresentation: "live",
        analysisSessionDate: "2026-09-29",
        nowMs: premarketStaleNow,
      }),
    ).toBe("STALE");
  });

  it("CASE G — premarket: fresh quote -> Fresh", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: closedValidThrough(premarketStaleNow),
        snapshotTsMs: premarketStaleNow - 5 * 60_000,
        analysisPresentation: "live",
        analysisSessionDate: "2026-09-29",
        nowMs: premarketStaleNow,
      }),
    ).toBe("FRESH");
  });

  it("CASE H — after-hours: stale quote -> Stale", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: closedValidThrough(afterHoursStaleNow),
        snapshotTsMs: afterHoursStaleNow - WATCHLIST_SNAPSHOT_STALE_MS - 1,
        analysisPresentation: "live",
        analysisSessionDate: "2026-09-29",
        nowMs: afterHoursStaleNow,
      }),
    ).toBe("STALE");
  });

  it("CASE I — invalid snapshot timestamp -> Unavailable", () => {
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough,
        snapshotTsMs: Number.NaN,
        nowMs: NOW,
      }),
    ).toBe("UNAVAILABLE");
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
