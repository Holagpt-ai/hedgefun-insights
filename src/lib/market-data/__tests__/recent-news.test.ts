import { describe, expect, it } from "vitest";
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
