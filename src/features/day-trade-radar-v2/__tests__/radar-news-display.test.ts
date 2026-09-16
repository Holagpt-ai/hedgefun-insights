import { describe, expect, it } from "vitest";
import {
  formatRadarNewsAge,
  NO_VERIFIED_NEWS_COPY,
  resolveRadarNewsDisplay,
} from "../radar-news-display";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";

const now = Date.parse("2026-09-16T20:00:00.000Z");

const catalyst = {
  kind: "recent",
  sortMs: 1,
  event: {
    title: "Company awarded $22M defense contract",
    event_type: "product_contract",
    published_at: "2026-09-16T11:00:00.000Z",
  },
} as CatalystEnrichmentEntry;

describe("Radar news / catalyst hierarchy", () => {
  it("verified catalyst wins over all news", () => {
    const display = resolveRadarNewsDisplay(
      "AAA",
      catalyst,
      {
        ticker: "AAA",
        title: "Company announces new distribution agreement",
        publishedAt: "2026-09-16T19:42:00.000Z",
        url: "https://example.com/news",
        source: "GlobeNewswire",
        provider: "finnhub",
      },
      now,
    );
    expect(display.level).toBe("catalyst");
    if (display.level === "catalyst") {
      expect(display.title).toMatch(/\$22M defense contract/);
      expect(display.category).toMatch(/Contract/i);
      expect(display.ageLabel).toBe("9h ago");
    }
  });

  it("uses recent provider news when catalyst is absent", () => {
    const display = resolveRadarNewsDisplay(
      "AAA",
      undefined,
      {
        ticker: "AAA",
        title: "Company announces new distribution agreement",
        publishedAt: "2026-09-16T19:42:00.000Z",
        url: null,
        source: "GlobeNewswire",
        provider: "finnhub",
      },
      now,
    );
    expect(display.level).toBe("recent");
    if (display.level === "recent") {
      expect(display.title).toMatch(/distribution agreement/);
      expect(display.source).toBe("GlobeNewswire");
      expect(display.ageLabel).toBe("18m ago");
    }
  });

  it("shows No verified news found when nothing is sourced", () => {
    expect(resolveRadarNewsDisplay("AAA", undefined, undefined)).toEqual({ level: "none" });
    expect(NO_VERIFIED_NEWS_COPY).toBe("No verified news found");
    expect(NO_VERIFIED_NEWS_COPY.toLowerCase()).not.toContain("reason for move");
  });

  it("formats compact source age", () => {
    expect(formatRadarNewsAge("2026-09-16T19:48:00.000Z", now)).toBe("12m ago");
    expect(formatRadarNewsAge("2026-09-16T18:00:00.000Z", now)).toBe("2h ago");
    expect(formatRadarNewsAge("not-a-date", now)).toBeNull();
  });
});
