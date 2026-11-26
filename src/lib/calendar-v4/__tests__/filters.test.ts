import { describe, expect, it } from "vitest";
import { applyCalendarPrimaryFilter, countHighImpact, primaryFilterCounts } from "@/lib/calendar-v4/filters";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

const base = (over: Partial<CalendarV4Event>): CalendarV4Event => ({
  eventId: "1",
  dedupeKey: null,
  securityId: null,
  symbols: ["AAA"],
  companyName: null,
  feedType: "catalyst",
  legendCategory: "other",
  title: "Test",
  description: null,
  eventDate: "2026-11-26",
  eventTime: null,
  publishedAt: null,
  status: "scheduled",
  impact: "unknown",
  hasImpactEvidence: false,
  source: "wire",
  sourceUrl: null,
  retrievedAt: null,
  provider: "test",
  aiSummaryId: null,
  ...over,
});

describe("calendar v4 filters", () => {
  it("high impact filter requires evidence flag", () => {
    const events = [
      base({ impact: "high", hasImpactEvidence: true }),
      base({ eventId: "2", impact: "high", hasImpactEvidence: false }),
    ];
    const filtered = applyCalendarPrimaryFilter(events, "high_impact", null);
    expect(filtered).toHaveLength(1);
    expect(countHighImpact(events)).toBe(1);
  });

  it("watchlist filter is user-scoped", () => {
    const events = [base({ symbols: ["AAA"] }), base({ eventId: "2", symbols: ["ZZZ"] })];
    const filtered = applyCalendarPrimaryFilter(events, "watchlist", new Set(["AAA"]));
    expect(filtered.map((e) => e.eventId)).toEqual(["1"]);
  });

  it("primary filter counts match visible buckets", () => {
    const events = [
      base({ feedType: "earnings", legendCategory: "earnings" }),
      base({ eventId: "2", feedType: "economic", legendCategory: "economic" }),
    ];
    const counts = primaryFilterCounts(events, null);
    expect(counts.all).toBe(2);
    expect(counts.earnings).toBe(1);
    expect(counts.macro).toBe(1);
  });
});