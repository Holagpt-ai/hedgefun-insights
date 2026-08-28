import { describe, it, expect } from "vitest";
import {
  consolidateRiskFlags,
  CURRENT_FLAGS_PER_TICKER,
  DATA_UNAVAILABLE_AGGREGATE_ID,
} from "@/lib/pre-market/risk-flags";

const NOW = Date.parse("2026-08-27T12:00:00.000Z");

function item(overrides: Record<string, unknown>) {
  return {
    id: "x",
    symbol: "AAPL",
    kind: "bearish_signal",
    label: "Bearish market signal",
    detail: "Price below VWAP",
    route: "/dashboard/watchlist?symbol=AAPL",
    event_time: "2026-08-27T11:00:00.000Z",
    ...overrides,
  };
}

describe("risk flag consolidation", () => {
  it("deduplicates identical alerts", () => {
    const { current, history } = consolidateRiskFlags([
      item({ id: "1" }),
      item({ id: "2" }),
    ], NOW);
    expect(history).toHaveLength(2);
    expect(current).toHaveLength(1);
  });

  it("collapses contradictory direction sequences to the latest state", () => {
    const { current } = consolidateRiskFlags([
      item({
        id: "old",
        kind: "alert_direction_change",
        label: "Watchlist alert",
        detail: "Direction changed from bearish to bullish",
        event_time: "2026-08-27T08:00:00.000Z",
      }),
      item({
        id: "new",
        kind: "alert_direction_change",
        label: "Watchlist alert",
        detail: "Direction changed from bullish to bearish",
        event_time: "2026-08-27T11:30:00.000Z",
      }),
    ], NOW);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe("new");
    expect(current[0].detail).toMatch(/to bearish/);
  });

  it("removes expired items from the current view but keeps history", () => {
    const { current, history } = consolidateRiskFlags([
      item({
        id: "expired",
        kind: "alert_company_event",
        label: "Watchlist alert",
        detail: "Old headline",
        event_time: "2026-08-26T11:00:00.000Z",
      }),
      item({
        id: "fresh",
        kind: "unusual_volume",
        label: "Unusual time-adjusted volume",
        detail: "RVOL 3.10",
        event_time: "2026-08-27T11:30:00.000Z",
      }),
    ], NOW);
    expect(history.map((h) => h.id)).toEqual(expect.arrayContaining(["expired", "fresh"]));
    expect(current.map((c) => c.id)).toEqual(["fresh"]);
  });

  it("caps current flags per ticker and preserves priority order", () => {
    const items = [
      item({ id: "j", kind: "journal_risk_missing", label: "Journal risk level missing", detail: "no stop" }),
      item({ id: "e", kind: "earnings_today", label: "Earnings today", detail: "Reports before the open" }),
      item({ id: "u", kind: "unusual_volume", label: "Unusual time-adjusted volume", detail: "RVOL 4.00" }),
      item({ id: "s", kind: "bearish_signal", label: "Bearish market signal", detail: "Lost prior close" }),
    ];
    const { current, history } = consolidateRiskFlags(items, NOW);
    expect(current).toHaveLength(CURRENT_FLAGS_PER_TICKER);
    expect(current.map((c) => c.id)).toEqual(["j", "e", "u"]);
    expect(history).toHaveLength(4);
  });

  it("collapses equal-timestamp direction changes deterministically by id", () => {
    const { current } = consolidateRiskFlags([
      item({
        id: "b-later-id",
        kind: "alert_direction_change",
        label: "Watchlist alert",
        detail: "Direction changed from bullish to bearish",
        event_time: "2026-08-27T11:00:00.000Z",
      }),
      item({
        id: "a-earlier-id",
        kind: "alert_direction_change",
        label: "Watchlist alert",
        detail: "Direction changed from bearish to bullish",
        event_time: "2026-08-27T11:00:00.000Z",
      }),
    ], NOW);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe("b-later-id");
    expect(current[0].detail).toMatch(/to bearish/);
  });

  it("does not label an expiring alert without a timestamp as current", () => {
    const { current, history } = consolidateRiskFlags([
      item({
        id: "no-time",
        kind: "alert_company_event",
        label: "Watchlist alert",
        detail: "Unstamped headline",
        event_time: null,
      }),
      item({
        id: "fresh",
        kind: "unusual_volume",
        label: "Unusual time-adjusted volume",
        detail: "RVOL 3.10",
        event_time: "2026-08-27T11:30:00.000Z",
      }),
    ], NOW);
    expect(history.map((h) => h.id)).toEqual(expect.arrayContaining(["no-time", "fresh"]));
    expect(current.map((c) => c.id)).toEqual(["fresh"]);
  });

  it("keeps complete history even when current view is collapsed", () => {
    const { history } = consolidateRiskFlags([
      item({ id: "a", event_time: "2026-08-27T10:00:00.000Z" }),
      item({ id: "b", detail: "Broke premarket low", event_time: "2026-08-27T10:05:00.000Z" }),
    ], NOW);
    expect(history).toHaveLength(2);
  });

  it("ranks trading risks above data-unavailable notices", () => {
    const { current } = consolidateRiskFlags([
      item({
        id: "d",
        kind: "data_unavailable",
        label: "Current market snapshot unavailable",
        detail: "Not enough intraday bars",
      }),
      item({ id: "j", kind: "journal_risk_missing", label: "Journal risk level missing", detail: "no stop" }),
      item({ id: "e", kind: "earnings_today", label: "Earnings today", detail: "Reports before the open" }),
      item({ id: "u", kind: "unusual_volume", label: "Unusual time-adjusted volume", detail: "RVOL 4.00" }),
    ], NOW);
    expect(current.map((c) => c.id)).toEqual(["j", "e", "u"]);
    expect(current.some((c) => c.kind === "data_unavailable")).toBe(false);
  });

  it("aggregates multiple current data-unavailable rows into one system notice", () => {
    const { current, history } = consolidateRiskFlags([
      item({
        id: "vrax",
        symbol: "VRAX",
        kind: "data_unavailable",
        label: "Current market snapshot unavailable",
        detail: "Current market snapshot unavailable",
      }),
      item({
        id: "shaz",
        symbol: "SHAZ",
        kind: "data_unavailable",
        label: "Current market snapshot unavailable",
        detail: "Not enough intraday bars",
      }),
      item({
        id: "nvve",
        symbol: "NVVE",
        kind: "data_unavailable",
        label: "Current market snapshot unavailable",
        detail: "Current market snapshot unavailable",
      }),
    ], NOW);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(DATA_UNAVAILABLE_AGGREGATE_ID);
    expect(current[0].symbol).toBeNull();
    expect(current[0].label).toBe("Market data incomplete for 3 watchlist names");
    expect(current[0].detail).toBe("VRAX · SHAZ · NVVE");
    expect(history.map((h) => h.id)).toEqual(expect.arrayContaining(["vrax", "shaz", "nvve"]));
    expect(history).toHaveLength(3);
  });
});
