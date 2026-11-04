import { describe, expect, it } from "vitest";
import { resolveRadarNewsCellStateWithPlatform } from "../radar-catalyst-platform";
import { resolveRadarNewsDisplay } from "../radar-news-display";

const now = Date.parse("2026-09-16T20:00:00.000Z");

function recentHeadline(title: string) {
  return {
    ticker: "X",
    title,
    publishedAt: "2026-09-16T19:42:00.000Z",
    url: "https://example.com/story",
    source: "Reuters",
    provider: "finnhub" as const,
  };
}

describe("Batch 195 — Radar recent-news company name integration", () => {
  it("shows Tesla-name headlines on TSLA when row company name is present", () => {
    const display = resolveRadarNewsCellStateWithPlatform({
      symbol: "TSLA",
      companyName: "Tesla, Inc.",
      catalyst: undefined,
      recent: recentHeadline("Tesla reports record Q3 vehicle deliveries"),
      newsStatus: "ok",
    });
    expect(display.level).toBe("recent");
  });

  it("shows Oracle-name headlines on ORCL when row company name is present", () => {
    const display = resolveRadarNewsCellStateWithPlatform({
      symbol: "ORCL",
      companyName: "Oracle Corporation",
      catalyst: undefined,
      recent: recentHeadline("Oracle raises cloud guidance after fiscal Q2 earnings beat"),
      newsStatus: "ok",
    });
    expect(display.level).toBe("recent");
  });

  it("excludes SpaceX-primary commentary from TSLA", () => {
    const display = resolveRadarNewsCellStateWithPlatform({
      symbol: "TSLA",
      companyName: "Tesla, Inc.",
      catalyst: undefined,
      recent: recentHeadline("Up Nearly 30% in August, Is SpaceX Stock Still a Buy?"),
      newsStatus: "ok",
    });
    expect(display.level).toBe("none");
  });

  it("excludes unrelated NVDA headlines from TSLA", () => {
    const display = resolveRadarNewsCellStateWithPlatform({
      symbol: "TSLA",
      companyName: "Tesla, Inc.",
      catalyst: undefined,
      recent: recentHeadline("Nvidia unveils next-generation AI accelerator, shares jump"),
      newsStatus: "ok",
    });
    expect(display.level).toBe("none");
  });

  it("fails closed when company name is missing and headline has no ticker token", () => {
    const withoutName = resolveRadarNewsDisplay(
      "TSLA",
      undefined,
      recentHeadline("Tesla reports record Q3 vehicle deliveries"),
      now,
      null,
    );
    expect(withoutName.level).toBe("none");
    const withName = resolveRadarNewsDisplay(
      "TSLA",
      undefined,
      recentHeadline("Tesla reports record Q3 vehicle deliveries"),
      now,
      "Tesla, Inc.",
    );
    expect(withName.level).toBe("recent");
  });

  it("does not treat symbol fallback as company identity", () => {
    const display = resolveRadarNewsCellStateWithPlatform({
      symbol: "TSLA",
      companyName: null,
      catalyst: undefined,
      recent: recentHeadline("Tesla reports record Q3 vehicle deliveries"),
      newsStatus: "ok",
    });
    expect(display.level).toBe("none");
  });
});
