import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapRecentNewsPayload } from "@/lib/market-data/recent-news";

describe("recent provider news window", () => {
  const now = Date.parse("2026-09-16T16:00:00.000Z");

  it("keeps a headline inside 24 hours", () => {
    const headline = mapRecentNewsPayload(
      "AAA",
      [{ title: "Company announces new distribution agreement", published_utc: "2026-09-16T12:00:00.000Z" }],
      now,
    );
    expect(headline?.title).toMatch(/distribution agreement/);
  });

  it("drops headlines older than 24 hours", () => {
    expect(
      mapRecentNewsPayload(
        "AAA",
        [{ title: "Old filing", published_utc: "2026-09-10T12:00:00.000Z" }],
        now,
      ),
    ).toBeNull();
  });
});

describe("getRecentHeadlinesForSymbols bounds", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/polygon");
    vi.resetModules();
  });

  it("bounds concurrency for a large symbol set", async () => {
    let inflight = 0;
    let maxInflight = 0;
    vi.doMock("@/lib/polygon", () => ({
      getTickerNews: async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inflight -= 1;
        return [];
      },
    }));
    const { RECENT_NEWS_FETCH_CONCURRENCY, getRecentHeadlinesForSymbols, resetRecentNewsSymbolCache } =
      await import("@/lib/market-data/recent-news");
    resetRecentNewsSymbolCache();
    const symbols = Array.from({ length: 60 }, (_, i) => `N${i}`);
    await getRecentHeadlinesForSymbols(symbols);
    expect(maxInflight).toBeGreaterThan(0);
    expect(maxInflight).toBeLessThanOrEqual(RECENT_NEWS_FETCH_CONCURRENCY);
  });
});
