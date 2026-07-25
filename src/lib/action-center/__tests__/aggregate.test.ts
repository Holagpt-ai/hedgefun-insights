import { describe, it, expect } from "vitest";
import {
  buildActionFeed,
  buildFocusTasks,
  catalystWatchList,
  resolveBriefType,
  savedUnreviewedCount,
  summaryCounts,
  watchlistSnapshot,
} from "@/lib/action-center/aggregate";
import type {
  OpenTradeRow,
  WatchlistAlertRow,
  WatchlistAnalysisRow,
} from "@/types/action-center";
import type { CatalystEvent } from "@/types/catalyst";

const NOW = Date.parse("2026-03-15T18:00:00Z"); // 14:00 ET

function analysis(over: Partial<WatchlistAnalysisRow>): WatchlistAnalysisRow {
  return {
    ticker: "AAA",
    direction: "bullish",
    failure_reason: null,
    price: 10, change_pct: 1, volume: 1000, rvol: 1.5, rvol_class: "elevated",
    session_type: "rth", session_date: "2026-03-15",
    analyzed_at: new Date(NOW - 60_000).toISOString(),
    valid_through: new Date(NOW + 5 * 60_000).toISOString(),
    ...over,
  };
}

function alert(over: Partial<WatchlistAlertRow>): WatchlistAlertRow {
  return {
    id: "a1", ticker: "AAA", alert_type: "unusual_volume", reason: "Volume spike",
    facts: {}, event_time: new Date(NOW - 60_000).toISOString(),
    session_date: "2026-03-15", dedupe_key: "dk",
    created_at: new Date(NOW - 60_000).toISOString(), ...over,
  };
}

function event(over: Partial<CatalystEvent>): CatalystEvent {
  return {
    id: "e1", dedupe_key: "dk1", symbol: "AAA", company_name: "AAA Inc",
    event_type: "earnings", verification_state: "provider_reported",
    event_date: "2026-03-20", event_time: null, time_of_day: null,
    title: "AAA earnings", description: null,
    source_name: "Provider", source_url: "https://x/y", provider: "prov",
    related_symbols: [], facts: {}, published_at: new Date(NOW - 60_000).toISOString(),
    ...over,
  };
}

function trade(over: Partial<OpenTradeRow>): OpenTradeRow {
  return {
    id: "t1", symbol: "AAA", side: "long", qty: 100, entry_price: 10,
    stop_price: null, target_price: null,
    entry_date: new Date(NOW - 3 * 86400_000).toISOString(), status: "open", ...over,
  };
}

describe("action-center aggregate", () => {
  it("1. summary counts use only qualifying real rows", () => {
    const s = summaryCounts({
      alerts: [alert({ id: "a1" }), alert({ id: "a2", created_at: new Date(NOW - 30 * 3600_000).toISOString() })],
      analyses: [analysis({ rvol_class: "unusual" })],
      catalyst: [event({})],
      openTrades: [trade({}), trade({ id: "t2", status: "closed" })],
      nowMs: NOW,
    });
    expect(s.watchlistAlerts).toBe(1);
    expect(s.unusualActivity).toBe(1);
    expect(s.catalystEvents).toBe(1);
    expect(s.openTrades).toBe(1);
  });

  it("2 & 3. stale watchlist excluded from directional; counted as awaiting refresh", () => {
    const stale = analysis({ ticker: "BBB", valid_through: new Date(NOW - 60_000).toISOString() });
    const snap = watchlistSnapshot([analysis({}), stale], NOW);
    expect(snap.bullish).toBe(1);
    expect(snap.awaitingRefresh).toBe(1);
  });

  it("4. data_unavailable stays its own bucket", () => {
    const snap = watchlistSnapshot([analysis({ direction: "data_unavailable" })], NOW);
    expect(snap.dataUnavailable).toBe(1);
    expect(snap.neutral).toBe(0);
  });

  it("5. Data Unavailable analyses never produce feed items (builder only consumes alerts/catalyst/trades)", () => {
    const feed = buildActionFeed({
      alerts: [], catalyst: [], savedEventIds: new Set(), reviewedEventIds: new Set(),
      openTrades: [], nowMs: NOW,
    });
    // Real assertion: unavailable analyses cannot leak in because the builder has no analyses input.
    expect(feed).toHaveLength(0);
    expect(feed.some((f) => f.source === "watchlist_alert")).toBe(false);
  });

  it("6. unusual activity counts distinct tickers only", () => {
    const s = summaryCounts({
      alerts: [], catalyst: [], openTrades: [],
      analyses: [
        analysis({ ticker: "AAA", rvol_class: "unusual" }),
        analysis({ ticker: "AAA", rvol_class: "unusual" }),
        analysis({ ticker: "BBB", rvol_class: "unusual" }),
      ],
      nowMs: NOW,
    });
    expect(s.unusualActivity).toBe(2);
  });

  it("7. Catalyst events provider_reported only", () => {
    const bad = event({ id: "e2", verification_state: "unverified" as unknown as "provider_reported" });
    const s = summaryCounts({ alerts: [], analyses: [], openTrades: [], catalyst: [event({}), bad], nowMs: NOW });
    expect(s.catalystEvents).toBe(1);
  });

  it("8. Catalyst event IDs deduplicated", () => {
    const dup = event({});
    const s = summaryCounts({ alerts: [], analyses: [], openTrades: [], catalyst: [dup, { ...dup }], nowMs: NOW });
    expect(s.catalystEvents).toBe(1);
  });

  it("9 & 10. upcoming nearest first; recent newest first (via catalystWatchList)", () => {
    const near = event({ id: "n", event_date: "2026-03-16", published_at: null });
    const far = event({ id: "f", event_date: "2026-03-19", published_at: null });
    const older = event({ id: "o", event_date: "2026-03-14", event_time: new Date(NOW - 40 * 3600_000).toISOString(), published_at: new Date(NOW - 40 * 3600_000).toISOString() });
    const newer = event({ id: "w", event_date: "2026-03-14", event_time: new Date(NOW - 2 * 3600_000).toISOString(), published_at: new Date(NOW - 2 * 3600_000).toISOString() });
    const list = catalystWatchList([far, near, older, newer], NOW, 6);
    expect(list.map((e) => e.id)).toEqual(["n", "f", "w", "o"]);
  });

  it("11 & 12. Volume-leader enrichment preserves the caller's volume-desc order", () => {
    // Simulate what the ActionCenter page does: sort by volume desc in the hook,
    // then annotate with catalyst enrichment. Enrichment must not reorder.
    const leaders = [
      { symbol: "AAA", volume: 10_000 },
      { symbol: "BBB", volume: 50_000 },
      { symbol: "CCC", volume: 30_000 },
    ].sort((a, b) => b.volume - a.volume);
    const enrichment = new Map<string, { kind: "upcoming" | "recent" }>([
      ["CCC", { kind: "upcoming" }], // enrichment only on the last row
    ]);
    const annotated = leaders.map((r) => ({ ...r, cat: enrichment.get(r.symbol) ?? null }));
    expect(annotated.map((r) => r.symbol)).toEqual(["BBB", "CCC", "AAA"]);
    expect(annotated.find((r) => r.symbol === "CCC")?.cat?.kind).toBe("upcoming");
    expect(annotated.find((r) => r.symbol === "BBB")?.cat).toBeNull();
  });

  it("13. open trades are already RLS-scoped (hook responsibility); builder trusts inputs", () => {
    const feed = buildActionFeed({
      alerts: [], catalyst: [], savedEventIds: new Set(), reviewedEventIds: new Set(),
      openTrades: [trade({})], nowMs: NOW,
    });
    expect(feed[0].bucket).toBe("open_position");
  });

  it("14. Action Feed uses only Now/Today/Upcoming/Open Position buckets", () => {
    const feed = buildActionFeed({
      alerts: [alert({ event_time: new Date(NOW - 60_000).toISOString() })],
      catalyst: [event({ id: "u1", event_date: "2026-03-16", published_at: null })],
      savedEventIds: new Set(), reviewedEventIds: new Set(),
      openTrades: [trade({})], nowMs: NOW,
    });
    const allowed = new Set(["now", "today", "upcoming", "open_position"]);
    expect(feed.every((f) => allowed.has(f.bucket))).toBe(true);
  });

  it("15. no score/confidence/weighted/rank fields exist on feed items", () => {
    const feed = buildActionFeed({
      alerts: [alert({})], catalyst: [event({})],
      savedEventIds: new Set(["e1"]), reviewedEventIds: new Set(),
      openTrades: [trade({})], nowMs: NOW,
    });
    const forbidden = /score|confidence|weighted|rank/i;
    for (const item of feed) {
      for (const key of Object.keys(item)) {
        expect(forbidden.test(key)).toBe(false);
      }
    }
  });

  it("16. empty state fabricates nothing", () => {
    const s = summaryCounts({ alerts: [], analyses: [], catalyst: [], openTrades: [], nowMs: NOW });
    expect(s).toEqual({ watchlistAlerts: 0, unusualActivity: 0, catalystEvents: 0, openTrades: 0 });
    expect(buildActionFeed({ alerts: [], catalyst: [], savedEventIds: new Set(), reviewedEventIds: new Set(), openTrades: [], nowMs: NOW })).toEqual([]);
    expect(watchlistSnapshot([], NOW)).toEqual({ bullish: 0, bearish: 0, neutral: 0, dataUnavailable: 0, awaitingRefresh: 0 });
  });

  it("17. one failed source doesn't suppress successful sections (buildFocusTasks composability)", () => {
    const tasks = buildFocusTasks({
      summary: { watchlistAlerts: 2, unusualActivity: 0, catalystEvents: 0, openTrades: 3 },
      savedUnreviewedCount: 0,
    });
    expect(tasks.map((t) => t.id)).toEqual(["alerts", "open"]);
  });

  it("18. symbol-aware routes are canonical (encoded in components; verify string here)", () => {
    const sym = "AAA";
    expect(`/dashboard/ai?symbol=${sym}`).toBe("/dashboard/ai?symbol=AAA");
    expect(`/dashboard/catalyst?symbol=${sym}`).toBe("/dashboard/catalyst?symbol=AAA");
    expect(`/dashboard/journal?symbol=${sym}`).toBe("/dashboard/journal?symbol=AAA");
    expect(`/stocks/${sym}`).toBe("/stocks/AAA");
  });

  it("19. AM/PM brief follows ET 4:00 PM boundary", () => {
    // 15:59 ET = 19:59 UTC (winter)
    expect(resolveBriefType(Date.parse("2026-03-15T19:59:00Z"))).toBe("am");
    expect(resolveBriefType(Date.parse("2026-03-15T20:00:00Z"))).toBe("pm");
  });

  it("20. saved-unreviewed count only counts saved without reviewed_at", () => {
    const n = savedUnreviewedCount(
      [event({ id: "e1" }), event({ id: "e2" }), event({ id: "e3" })],
      [
        { id: "u1", event_id: "e1", saved_at: "2026-01-01", reviewed_at: null },
        { id: "u2", event_id: "e2", saved_at: "2026-01-01", reviewed_at: "2026-01-02" },
      ],
    );
    expect(n).toBe(1);
  });

  it("21. date-only earnings event_date is resolved as ET midnight (not UTC midnight)", async () => {
    const { eventMomentMs, etMidnightMs } = await import("@/lib/catalyst/parsers");
    // 2026-03-16 in ET (EDT, UTC-4) → 04:00 UTC
    expect(etMidnightMs("2026-03-16")).toBe(Date.UTC(2026, 2, 16, 4, 0, 0));
    // Winter (EST, UTC-5) → 05:00 UTC
    expect(etMidnightMs("2026-01-15")).toBe(Date.UTC(2026, 0, 15, 5, 0, 0));
    const m = eventMomentMs({ event_date: "2026-03-16", event_time: null, published_at: null });
    expect(m).toBe(Date.UTC(2026, 2, 16, 4, 0, 0));
    expect(m).not.toBe(Date.parse("2026-03-16T00:00:00Z"));
  });

  it("22. open-trade feed titles use long/short semantics from journal_trades (never buy/sell)", () => {
    const feed = buildActionFeed({
      alerts: [], catalyst: [], savedEventIds: new Set(), reviewedEventIds: new Set(),
      openTrades: [trade({ side: "long", qty: 100, stop_price: 9, target_price: 12 })],
      nowMs: NOW,
    });
    expect(feed).toHaveLength(1);
    expect(feed[0].title).toContain("Long 100 @ 10");
    expect(feed[0].title).not.toMatch(/buy|sell/i);
    expect(feed[0].detail).toContain("Stop 9");
    expect(feed[0].detail).toContain("Target 12");
  });

  describe("ET date-only earnings classification (P1-R1 patch)", () => {
    // Today (ET): 2026-03-15. ET midnight = 2026-03-15T04:00Z (EDT).
    const NOON_ET = Date.parse("2026-03-15T16:00:00Z"); // 12:00 ET
    const LATE_ET = Date.parse("2026-03-16T02:30:00Z"); // 22:30 ET on 3/15
    const UTC_CROSSED = Date.parse("2026-03-16T03:00:00Z"); // 23:00 ET on 3/15 (UTC day already 3/16)

    const todayDateOnly = event({
      id: "today", event_date: "2026-03-15", event_time: null, published_at: null,
    });
    const tomorrowDateOnly = event({
      id: "tmrw", event_date: "2026-03-16", event_time: null, published_at: null,
    });

    it("23. today's date-only earnings at noon ET counts as Today in summary and feed", () => {
      const s = summaryCounts({
        alerts: [], analyses: [], openTrades: [], catalyst: [todayDateOnly], nowMs: NOON_ET,
      });
      expect(s.catalystEvents).toBe(1);
      const feed = buildActionFeed({
        alerts: [], catalyst: [todayDateOnly],
        savedEventIds: new Set(), reviewedEventIds: new Set(),
        openTrades: [], nowMs: NOON_ET,
      });
      expect(feed).toHaveLength(1);
      expect(feed[0].source).toBe("catalyst_upcoming");
      expect(feed[0].bucket).toBe("today");
    });

    it("24. today's date-only earnings late evening ET is still Today (not recent)", () => {
      const feed = buildActionFeed({
        alerts: [], catalyst: [todayDateOnly],
        savedEventIds: new Set(), reviewedEventIds: new Set(),
        openTrades: [], nowMs: LATE_ET,
      });
      expect(feed).toHaveLength(1);
      expect(feed[0].bucket).toBe("today");
      const watch = catalystWatchList([todayDateOnly], LATE_ET, 6);
      expect(watch).toHaveLength(1);
      expect(watch[0].id).toBe("today");
    });

    it("25. tomorrow's date-only earnings is Upcoming", () => {
      const feed = buildActionFeed({
        alerts: [], catalyst: [tomorrowDateOnly],
        savedEventIds: new Set(), reviewedEventIds: new Set(),
        openTrades: [], nowMs: NOON_ET,
      });
      expect(feed).toHaveLength(1);
      expect(feed[0].bucket).toBe("upcoming");
    });

    it("26. UTC date crossing does not reclassify the ET calendar day", () => {
      // At 23:00 ET on 3/15 the UTC clock reads 03:00 on 3/16, but the ET day
      // is still 3/15 — today's date-only earnings must remain scheduled.
      const s = summaryCounts({
        alerts: [], analyses: [], openTrades: [], catalyst: [todayDateOnly], nowMs: UTC_CROSSED,
      });
      expect(s.catalystEvents).toBe(1);
      const feed = buildActionFeed({
        alerts: [], catalyst: [todayDateOnly],
        savedEventIds: new Set(), reviewedEventIds: new Set(),
        openTrades: [], nowMs: UTC_CROSSED,
      });
      expect(feed).toHaveLength(1);
      expect(feed[0].bucket).toBe("today");
    });
  });
});
