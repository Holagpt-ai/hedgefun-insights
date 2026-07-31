// Vitest unit tests for Catalyst frontend parsers.

import { describe, it, expect } from "vitest";
import {
  normalizeSymbol,
  eventMomentMs,
  scheduledMomentMs,
  horizonWindow,
  horizonMomentMs,
  isWithinHorizon,
  makeComparator,
  isFuture,
  isRecent,
  catalystEventsFetchWindow,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_ORDER,
} from "@/lib/catalyst/parsers";
import { enrichmentFetchWindow } from "@/lib/catalyst/enrichment";

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
    // Date-only earnings resolve to ET midnight (EST/UTC-5 on Jan 1 = 05:00Z).
    expect(
      eventMomentMs({ event_date: "2026-01-01" }),
    ).toBe(Date.UTC(2026, 0, 1, 5, 0, 0));
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

/** Production-shaped XRX earnings row (date-only, older announcement published_at). */
function xrxEarnings() {
  return {
    symbol: "XRX",
    event_type: "earnings" as const,
    event_date: "2026-07-30",
    event_time: null as string | null,
    title: "Xerox Holdings Corporation Common Stock earnings",
    source_name: "Earnings Calendar",
    published_at: "2026-07-01T12:00:00.000Z",
    company_name: "Xerox Holdings Corporation Common Stock",
  };
}

describe("catalystEventsFetchWindow (page P1-R2 parity)", () => {
  const afterUtcMidnight = Date.parse("2026-07-31T00:00:01.000Z");

  it("derives event_date lower bound from now − recentDays, not UTC today", () => {
    const w = catalystEventsFetchWindow(afterUtcMidnight, 3, 30);
    expect(w.eventDateFrom).toBe("2026-07-28");
    expect(w.eventDateFrom).not.toBe("2026-07-31");
    expect(w.upcomingTo).toBe("2026-08-30");
    expect(w.recentFromIso).toBe(
      new Date(afterUtcMidnight - 3 * 86_400_000).toISOString(),
    );
  });

  it("matches enrichmentFetchWindow for the default 3d / 30d page window", () => {
    const page = catalystEventsFetchWindow(afterUtcMidnight, 3, 30);
    const enrich = enrichmentFetchWindow(afterUtcMidnight);
    expect(page.recentFromIso).toBe(enrich.recentFromIso);
    expect(page.eventDateFrom).toBe(enrich.eventDateFrom);
    expect(page.upcomingTo).toBe(enrich.upcomingTo);
  });

  it("includes XRX event_date 2026-07-30 in the fetched set on July 31", () => {
    const w = catalystEventsFetchWindow(afterUtcMidnight, 3, 30);
    const xrx = xrxEarnings();
    const publishedOk = xrx.published_at >= w.recentFromIso;
    const eventDateOk =
      xrx.event_date >= w.eventDateFrom && xrx.event_date <= w.upcomingTo;
    expect(publishedOk).toBe(false);
    expect(eventDateOk).toBe(true);
  });
});

describe("XRX July 30→31 page recent-window regression", () => {
  const now = Date.parse("2026-07-31T16:00:00.000Z");
  const xrx = xrxEarnings();

  it("uses scheduledMomentMs so older published_at cannot demote the earnings date", () => {
    expect(scheduledMomentMs(xrx)).not.toBeNull();
    expect(horizonMomentMs(xrx)).toBe(scheduledMomentMs(xrx));
    expect(horizonMomentMs(xrx)).not.toBe(eventMomentMs(xrx));
  });

  it("includes XRX under Recent 72 Hours on July 31", () => {
    expect(isWithinHorizon(xrx, "recent_72h", now)).toBe(true);
  });

  it("does not treat XRX as upcoming under Next 7 Days on July 31", () => {
    expect(isWithinHorizon(xrx, "next_7_days", now)).toBe(false);
    expect(isWithinHorizon(xrx, "next_30_days", now)).toBe(false);
  });

  it("keeps a future scheduled earnings in Next 7 Days but not Recent 72 Hours", () => {
    const future = {
      symbol: "USEA",
      event_type: "earnings" as const,
      event_date: "2026-08-02",
      event_time: null as string | null,
      published_at: "2026-07-01T00:00:00.000Z",
      title: "USEA near earnings",
      source_name: "Earnings Calendar",
    };
    expect(isWithinHorizon(future, "next_7_days", now)).toBe(true);
    expect(isWithinHorizon(future, "recent_72h", now)).toBe(false);
  });

  it("retains published_at precedence for non-scheduled news without event_date", () => {
    const news = {
      published_at: "2026-07-30T18:00:00.000Z",
      event_time: null as string | null,
      event_date: null as string | null,
    };
    expect(horizonMomentMs(news)).toBe(Date.parse(news.published_at));
    expect(isWithinHorizon(news, "recent_72h", now)).toBe(true);
  });

  it("prefers explicit event_time over announcement published_at for scheduled rows", () => {
    const timed = {
      ...xrx,
      event_time: "2026-07-30T20:00:00.000Z",
      published_at: "2026-07-01T12:00:00.000Z",
    };
    expect(horizonMomentMs(timed)).toBe(Date.parse("2026-07-30T20:00:00.000Z"));
    expect(isWithinHorizon(timed, "recent_72h", now)).toBe(true);
  });
});
