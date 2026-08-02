import { describe, expect, it } from "vitest";
import { formatIndexFreshness } from "@/components/layout/MarketTicker";

describe("index strip freshness disclosure", () => {
  it("renders the known Aug 1 UTC timestamp in New York time", () => {
    expect(formatIndexFreshness(["2026-08-01T00:58:00Z"])).toBe(
      "Index data as of Fri, Jul 31, 2026 · 8:58 PM ET",
    );
  });

  it("uses EST offset for winter timestamps", () => {
    // 2026-01-15T00:58:00Z -> Jan 14, 7:58 PM EST
    expect(formatIndexFreshness(["2026-01-15T00:58:00Z"])).toBe(
      "Index data as of Wed, Jan 14, 2026 · 7:58 PM ET",
    );
  });

  it("uses the oldest valid timestamp among displayed rows", () => {
    expect(
      formatIndexFreshness([
        "2026-08-02T14:00:00Z",
        "2026-08-01T00:58:00Z",
        "2026-08-02T18:30:00Z",
      ]),
    ).toBe("Index data as of Fri, Jul 31, 2026 · 8:58 PM ET");
  });

  it("reports unavailable for missing, empty, or malformed timestamps", () => {
    const unavailable = "Index data freshness unavailable";
    expect(formatIndexFreshness([])).toBe(unavailable);
    expect(formatIndexFreshness([null])).toBe(unavailable);
    expect(formatIndexFreshness([undefined])).toBe(unavailable);
    expect(formatIndexFreshness(["   "])).toBe(unavailable);
    expect(formatIndexFreshness(["not-a-date"])).toBe(unavailable);
    expect(formatIndexFreshness(["2026-08-01T00:58:00Z", null])).toBe(unavailable);
  });

  it("never uses relative or liveness wording", () => {
    const out = formatIndexFreshness(["2026-08-01T00:58:00Z"]).toLowerCase();
    for (const word of ["today", "yesterday", "ago", "live", "real-time", "current"]) {
      expect(out).not.toContain(word);
    }
  });
});
