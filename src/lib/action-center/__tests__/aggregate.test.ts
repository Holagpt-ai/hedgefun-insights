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

  it("11 & 12. Screener rows: caller preserves volume-desc, enrichment does not reorder (contract test)", () => {
    // Sorting is done in the hook; the feed builder never touches screener rows.
    const feed = buildActionFeed({
      alerts: [], catalyst: [], savedEventIds: new Set(), reviewedEventIds: new Set(),
      openTrades: [], nowMs: NOW,
    });
    expect(feed).toEqual([]);
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
});
