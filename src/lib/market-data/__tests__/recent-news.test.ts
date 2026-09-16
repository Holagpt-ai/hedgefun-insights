import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("recent provider news window", () => {
  const now = Date.parse("2026-09-16T16:00:00.000Z");

  it("keeps a headline inside 24 hours from the radar-news contract", async () => {
    const { mapRadarNewsPayload } = await import("@/lib/market-data/recent-news");
    const mapped = mapRadarNewsPayload(
      "AAA",
      {
        ticker: "AAA",
        status: "ok",
        articles: [{
          title: "Company announces new distribution agreement",
          source: "GlobeNewswire",
          published_at: "2026-09-16T12:00:00.000Z",
          url: "https://example.com/story",
          provider: "finnhub",
        }],
      },
      now,
    );
    expect(mapped.status).toBe("ok");
    expect(mapped.article?.title).toMatch(/distribution agreement/);
    expect(mapped.article?.provider).toBe("finnhub");
  });

  it("drops headlines older than 24 hours even if the server included them", async () => {
    const { mapRadarNewsPayload } = await import("@/lib/market-data/recent-news");
    expect(
      mapRadarNewsPayload(
        "AAA",
        {
          ticker: "AAA",
          status: "ok",
          articles: [{
            title: "Old filing",
            source: "Wire",
            published_at: "2026-09-10T12:00:00.000Z",
            url: null,
            provider: "massive",
          }],
        },
        now,
      ).article,
    ).toBeNull();
  });
});

describe("getRecentHeadlinesForSymbols bounds and cache", () => {
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
      getRadarNews: async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inflight -= 1;
        return { ticker: "X", status: "empty", articles: [] };
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

  it("does not long-cache unavailable news and recovers on the next fetch", async () => {
    let calls = 0;
    vi.doMock("@/lib/polygon", () => ({
      getRadarNews: async () => {
        calls += 1;
        if (calls === 1) return { ticker: "AAA", status: "unavailable", articles: [] };
        return {
          ticker: "AAA",
          status: "ok",
          articles: [{
            title: "Antelope Enterprise closes $6M convertible note offering",
            source: "GlobeNewswire",
            published_at: "2026-09-16T15:00:00.000Z",
            url: "https://example.com/aehl",
            provider: "finnhub",
          }],
        };
      },
    }));
    const { getRecentHeadlinesForSymbols, peekRecentNewsRecord } = await import("@/lib/market-data/recent-news");
    const first = await getRecentHeadlinesForSymbols(["AAA"]);
    expect(first.get("AAA")?.status).toBe("unavailable");
    expect(peekRecentNewsRecord("AAA")).toBeNull();
    const second = await getRecentHeadlinesForSymbols(["AAA"]);
    expect(second.get("AAA")?.article?.title).toMatch(/convertible note/);
    expect(peekRecentNewsRecord("AAA")?.status).toBe("ok");
    expect(calls).toBe(2);
  });

  it("uses the short cache for a successful empty response", async () => {
    const getRadarNews = vi.fn(async () => ({ ticker: "GLOO", status: "empty", articles: [] }));
    vi.doMock("@/lib/polygon", () => ({ getRadarNews }));
    const { getRecentHeadlinesForSymbols, peekRecentNewsRecord } = await import("@/lib/market-data/recent-news");
    const first = await getRecentHeadlinesForSymbols(["GLOO"]);
    expect(first.get("GLOO")?.status).toBe("empty");
    expect(peekRecentNewsRecord("GLOO")?.status).toBe("empty");
    await getRecentHeadlinesForSymbols(["GLOO"]);
    expect(getRadarNews).toHaveBeenCalledTimes(1);
  });
});

describe("radar news honesty", () => {
  it("does not expose API keys to the frontend news client", () => {
    const polygon = readFileSync(resolve("src/lib/polygon.ts"), "utf8");
    const recent = readFileSync(resolve("src/lib/market-data/recent-news.ts"), "utf8");
    expect(polygon).not.toMatch(/FINNHUB_API_KEY|POLYGON_API_KEY/);
    expect(recent).not.toMatch(/FINNHUB_API_KEY|POLYGON_API_KEY|token=/);
    expect(polygon).toMatch(/type: "radar-news"/);
  });

  it("does not introduce an LLM call", () => {
    const recent = readFileSync(resolve("src/lib/market-data/recent-news.ts"), "utf8");
    const display = readFileSync(resolve("src/features/day-trade-radar-v2/radar-news-display.ts"), "utf8");
    for (const src of [recent, display]) {
      expect(src).not.toMatch(/openai|anthropic|generateText|\bLLM\b/i);
    }
  });
});
