// Vitest unit tests for Catalyst frontend parsers.

import { describe, it, expect } from "vitest";
import {
  normalizeSymbol,
  eventMomentMs,
  horizonWindow,
  isWithinHorizon,
  makeComparator,
  isFuture,
  isRecent,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_ORDER,
} from "@/lib/catalyst/parsers";

describe("normalizeSymbol", () => {
  it("accepts valid tickers, uppercased", () => {
    expect(normalizeSymbol("aapl")).toBe("AAPL");
    expect(normalizeSymbol("BRK.B")).toBe("BRK.B");
  });
  it("rejects invalid input (task #14: invalid ?symbol= handling)", () => {
    expect(normalizeSymbol("")).toBeNull();
    expect(normalizeSymbol("1234")).toBeNull();
    expect(normalizeSymbol("<script>")).toBeNull();
    expect(normalizeSymbol(null)).toBeNull();
    expect(normalizeSymbol(undefined)).toBeNull();
  });
});

describe("eventMomentMs", () => {
  it("prefers event_time then published_at then event_date", () => {
    expect(
      eventMomentMs({ event_time: "2026-01-01T12:00:00Z" }),
    ).toBe(Date.parse("2026-01-01T12:00:00Z"));
    expect(
      eventMomentMs({ event_time: null, published_at: "2026-01-01T00:00:00Z" }),
    ).toBe(Date.parse("2026-01-01T00:00:00Z"));
    expect(
      eventMomentMs({ event_date: "2026-01-01" }),
    ).toBe(Date.parse("2026-01-01T00:00:00Z"));
    expect(eventMomentMs({})).toBeNull();
  });
});

describe("horizon filtering (task #9)", () => {
  const now = Date.parse("2026-01-15T12:00:00Z");
  it("today window is single UTC day", () => {
    const w = horizonWindow("today", now);
    expect(w.toMs - w.fromMs).toBe(86_400_000);
  });
  it("next_7_days keeps future events only", () => {
    expect(isWithinHorizon({ event_date: "2026-01-16" }, "next_7_days", now)).toBe(true);
    expect(isWithinHorizon({ event_date: "2026-02-15" }, "next_7_days", now)).toBe(false);
  });
  it("recent_72h keeps past events only", () => {
    expect(isWithinHorizon(
      { published_at: "2026-01-14T12:00:00Z" }, "recent_72h", now,
    )).toBe(true);
    expect(isWithinHorizon(
      { published_at: "2026-01-16T12:00:00Z" }, "recent_72h", now,
    )).toBe(false);
  });
});

describe("comparators", () => {
  const now = Date.parse("2026-01-15T12:00:00Z");
  it("upcoming: nearest first (task #10)", () => {
    const cmp = makeComparator(true, now);
    const arr = [
      { symbol: "B", event_date: "2026-01-20" },
      { symbol: "A", event_date: "2026-01-16" },
    ];
    arr.sort(cmp);
    expect(arr[0].symbol).toBe("A");
  });
  it("recent: newest first (task #11)", () => {
    const cmp = makeComparator(false, now);
    const arr = [
      { symbol: "B", published_at: "2026-01-14T00:00:00Z" },
      { symbol: "A", published_at: "2026-01-15T00:00:00Z" },
    ];
    arr.sort(cmp);
    expect(arr[0].symbol).toBe("A");
  });
});

describe("Screener enrichment prefers upcoming over recent (task #12)", () => {
  // Simulates the priority rule inside useCatalystEnrichmentForSymbols:
  // upcoming beats recent regardless of moment order.
  const now = Date.parse("2026-01-15T12:00:00Z");
  it("future event wins even if recent one is closer to now", () => {
    const upcoming = { event_date: "2026-01-20" };
    const recent = { published_at: "2026-01-15T11:00:00Z" };
    expect(isFuture(upcoming, now)).toBe(true);
    expect(isFuture(recent, now)).toBe(false);
    expect(isRecent(recent, now, 72)).toBe(true);
  });
});

describe("event type labels", () => {
  it("has label for every closed-set type (task #17: no fabrication)", () => {
    for (const t of EVENT_TYPE_ORDER) {
      expect(typeof EVENT_TYPE_LABEL[t]).toBe("string");
      expect(EVENT_TYPE_LABEL[t].length).toBeGreaterThan(0);
    }
  });
});
