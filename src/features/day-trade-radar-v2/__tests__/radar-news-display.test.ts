import { describe, expect, it } from "vitest";
import { NO_VERIFIED_NEWS_COPY, resolveRadarNewsDisplay } from "../radar-news-display";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";

const catalyst = {
  kind: "recent",
  sortMs: 1,
  event: {
    title: "Company awarded $22M defense contract",
    event_type: "product_contract",
    published_at: "2026-09-16T12:00:00.000Z",
  },
} as CatalystEnrichmentEntry;

describe("Radar news / catalyst hierarchy", () => {
  it("verified catalyst wins over generic recent news", () => {
    const display = resolveRadarNewsDisplay("AAA", catalyst, {
      ticker: "AAA",
      title: "Company announces new distribution agreement",
      publishedAt: "2026-09-16T13:00:00.000Z",
      url: null,
    });
    expect(display.level).toBe("catalyst");
    if (display.level === "catalyst") {
      expect(display.title).toMatch(/\$22M defense contract/);
      expect(display.category).toMatch(/Contract/i);
    }
  });

  it("uses recent provider news when catalyst is absent", () => {
    const display = resolveRadarNewsDisplay("AAA", undefined, {
      ticker: "AAA",
      title: "Company announces new distribution agreement",
      publishedAt: "2026-09-16T13:00:00.000Z",
      url: null,
    });
    expect(display.level).toBe("recent");
    if (display.level === "recent") {
      expect(display.title).toMatch(/distribution agreement/);
    }
  });

  it("shows No verified news found when nothing is sourced", () => {
    expect(resolveRadarNewsDisplay("AAA", undefined, undefined)).toEqual({ level: "none" });
    expect(NO_VERIFIED_NEWS_COPY).toBe("No verified news found");
    expect(NO_VERIFIED_NEWS_COPY.toLowerCase()).not.toContain("reason for move");
  });
});
