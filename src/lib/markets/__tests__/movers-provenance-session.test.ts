import { describe, expect, it } from "vitest";
import { moverFromPolygonTicker } from "@/lib/markets/movers-integrity";
import {
  summarizeMoversListProvenance,
  summarizeSessionDates,
} from "@/lib/markets/movers-provenance";

const FRIDAY_DAY_MS = Date.parse("2026-08-28T20:00:00.000Z");
const MONDAY_PREMARKET_MS = Date.parse("2026-08-31T12:00:00.000Z");

function ticker(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "AAA",
    name: "Example",
    todaysChangePerc: 5,
    day: { c: 21, v: 1_000_000, t: MONDAY_PREMARKET_MS },
    prevDay: { c: 20 },
    lastTrade: { p: 21, t: MONDAY_PREMARKET_MS },
    min: { c: 21, t: MONDAY_PREMARKET_MS },
    ...overrides,
  };
}

function sessionHeader(movers: ReturnType<typeof moverFromPolygonTicker>[]) {
  return summarizeMoversListProvenance(movers, {
    nowMs: MONDAY_PREMARKET_MS,
    universe: "top_gainers",
    moverSession: "regular",
  }).sessionLine;
}

describe("summarizeSessionDates", () => {
  it("returns homogeneous_current when every valid row shares the current verified session date", () => {
    const a = moverFromPolygonTicker(ticker({ ticker: "A" }), "regular", MONDAY_PREMARKET_MS);
    const b = moverFromPolygonTicker(ticker({ ticker: "B", day: { c: 22, v: 500_000, t: MONDAY_PREMARKET_MS }, prevDay: { c: 20 } }), "regular", MONDAY_PREMARKET_MS);
    const summary = summarizeSessionDates([a, b], "regular", MONDAY_PREMARKET_MS);
    expect(summary.mode).toBe("homogeneous_current");
    expect(summary.isPriorHomogeneous).toBe(false);
  });

  it("returns homogeneous_prior when every valid row shares the same prior verified session date", () => {
    const a = moverFromPolygonTicker(ticker({ ticker: "A", day: { c: 21, v: 1_000_000, t: FRIDAY_DAY_MS }, prevDay: { c: 20 }, lastTrade: { p: 21, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    const b = moverFromPolygonTicker(ticker({ ticker: "B", day: { c: 22, v: 500_000, t: FRIDAY_DAY_MS }, prevDay: { c: 20 }, lastTrade: { p: 22, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    const summary = summarizeSessionDates([a, b], "regular", MONDAY_PREMARKET_MS);
    expect(summary.mode).toBe("homogeneous_prior");
    expect(summary.isPriorHomogeneous).toBe(true);
  });

  it("returns partially_unverified when prior verified rows coexist with untimed valid rows", () => {
    const prior = moverFromPolygonTicker(ticker({ ticker: "OLD", day: { c: 21, v: 100, t: FRIDAY_DAY_MS }, prevDay: { c: 20 }, lastTrade: { p: 21, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    const untimed = moverFromPolygonTicker({
      ticker: "UNTIMED",
      todaysChangePerc: 3,
      day: { c: 19, v: 500_000 },
      prevDay: { c: 18 },
      lastTrade: { p: 19 },
    }, "regular", MONDAY_PREMARKET_MS);
    const summary = summarizeSessionDates([prior, untimed], "regular", MONDAY_PREMARKET_MS);
    expect(summary.mode).toBe("partially_unverified");
    expect(summary.mode).not.toBe("homogeneous_prior");
  });

  it("returns partially_unverified when current verified rows coexist with untimed valid rows", () => {
    const current = moverFromPolygonTicker(ticker({ ticker: "NOW" }), "regular", MONDAY_PREMARKET_MS);
    const untimed = moverFromPolygonTicker({
      ticker: "UNTIMED",
      todaysChangePerc: 3,
      day: { c: 19, v: 500_000 },
      prevDay: { c: 18 },
      lastTrade: { p: 19 },
    }, "regular", MONDAY_PREMARKET_MS);
    const summary = summarizeSessionDates([current, untimed], "regular", MONDAY_PREMARKET_MS);
    expect(summary.mode).toBe("partially_unverified");
    expect(summary.mode).not.toBe("homogeneous_current");
  });
});

describe("rendered session header lines", () => {
  it("shows prior homogeneous copy only when all rows agree on a prior verified date", () => {
    const a = moverFromPolygonTicker(ticker({ ticker: "A", day: { c: 21, v: 1_000_000, t: FRIDAY_DAY_MS }, prevDay: { c: 20 }, lastTrade: { p: 21, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    const b = moverFromPolygonTicker(ticker({ ticker: "B", day: { c: 22, v: 500_000, t: FRIDAY_DAY_MS }, prevDay: { c: 20 }, lastTrade: { p: 22, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    expect(sessionHeader([a, b])).toMatch(/Prior source session · 2026-08-28/);
  });

  it("shows partial evidence copy for prior plus untimed movers", () => {
    const prior = moverFromPolygonTicker(ticker({ ticker: "OLD", day: { c: 21, v: 100, t: FRIDAY_DAY_MS }, prevDay: { c: 20 }, lastTrade: { p: 21, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    const untimed = moverFromPolygonTicker({
      ticker: "UNTIMED",
      todaysChangePerc: 3,
      day: { c: 19, v: 500_000 },
      prevDay: { c: 18 },
      lastTrade: { p: 19 },
    }, "regular", MONDAY_PREMARKET_MS);
    const line = sessionHeader([prior, untimed]);
    expect(line).toMatch(/Partial source-session evidence/);
    expect(line).not.toMatch(/Prior source session · 2026-08-28/);
  });

  it("shows partial evidence copy for current plus untimed movers", () => {
    const current = moverFromPolygonTicker(ticker({ ticker: "NOW" }), "regular", MONDAY_PREMARKET_MS);
    const untimed = moverFromPolygonTicker({
      ticker: "UNTIMED",
      todaysChangePerc: 3,
      day: { c: 19, v: 500_000 },
      prevDay: { c: 18 },
      lastTrade: { p: 19 },
    }, "regular", MONDAY_PREMARKET_MS);
    const line = sessionHeader([current, untimed]);
    expect(line).toMatch(/Partial source-session evidence/);
    expect(line).not.toMatch(/Prior source session/);
  });

  it("keeps a homogeneous current-session header without partial or prior prefixes", () => {
    const a = moverFromPolygonTicker(ticker({ ticker: "A" }), "regular", MONDAY_PREMARKET_MS);
    const b = moverFromPolygonTicker(ticker({ ticker: "B" }), "regular", MONDAY_PREMARKET_MS);
    const line = sessionHeader([a, b]);
    expect(line).not.toMatch(/Partial source-session evidence/);
    expect(line).not.toMatch(/Prior source session/);
    expect(line).not.toMatch(/Mixed source sessions/);
  });
});
