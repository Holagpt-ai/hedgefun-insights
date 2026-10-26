import { describe, expect, it } from "vitest";
import {
  formatMoverObservationEt,
  resolveDisplayedPriceSource,
  resolvePolygonMoverSourceEvidence,
} from "@/lib/markets/movers-observation";
import { moverFromPolygonTicker, mapPolygonMoversDetailed, toMoverListRow } from "@/lib/markets/movers-integrity";
import {
  moversSuccessfulEmptyMessage,
  summarizeListObservationTimes,
  summarizeMoversListProvenance,
  summarizeSessionDates,
} from "@/lib/markets/movers-provenance";

const FRIDAY_DAY_MS = Date.parse("2026-08-28T20:00:00.000Z");
const MONDAY_PREMARKET_MS = Date.parse("2026-08-31T12:00:00.000Z");
const MONDAY_TRADE_MS = Date.parse("2026-08-31T13:30:00.000Z");

function fridayRegularTicker(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "FRI",
    name: "Friday Corp",
    todaysChangePerc: 4,
    day: { c: 21, v: 5_000_000, t: FRIDAY_DAY_MS },
    prevDay: { c: 20 },
    lastTrade: { p: 21, t: FRIDAY_DAY_MS },
    min: { c: 21, t: FRIDAY_DAY_MS },
    ...overrides,
  };
}

describe("movers observation evidence", () => {
  it("uses UTC daily bar date for regular session source dates", () => {
    const evidence = resolvePolygonMoverSourceEvidence(
      "regular",
      { day: { t: FRIDAY_DAY_MS, c: 21, v: 1 } },
      MONDAY_PREMARKET_MS,
      "day_close",
    );
    expect(evidence.sessionDate).toBe("2026-08-28");
    expect(evidence.basis).toBe("day_aggregate");
    expect(evidence.providerAsOfMs).toBe(FRIDAY_DAY_MS);
  });

  it("marks missing day.t as unverified for regular movers", () => {
    const evidence = resolvePolygonMoverSourceEvidence(
      "regular",
      { day: { c: 21, v: 1 } },
      MONDAY_PREMARKET_MS,
      "day_close",
    );
    expect(evidence.sessionDate).toBeNull();
    expect(evidence.sessionDateUnverified).toBe(true);
    expect(evidence.observationTimeUnavailable).toBe(true);
  });

  it("uses last trade timestamp only when lastTrade.p is the displayed price", () => {
    const evidence = resolvePolygonMoverSourceEvidence(
      "premarket",
      {
        lastTrade: { p: 21, t: MONDAY_PREMARKET_MS },
        min: { c: 21.5, t: MONDAY_TRADE_MS },
      },
      MONDAY_PREMARKET_MS,
      "last_trade",
    );
    expect(evidence.basis).toBe("last_trade");
    expect(evidence.providerAsOfMs).toBe(MONDAY_PREMARKET_MS);
  });

  it("uses minute bar timestamp only when min.c is the displayed price", () => {
    const evidence = resolvePolygonMoverSourceEvidence(
      "premarket",
      {
        lastTrade: { p: 0, t: MONDAY_TRADE_MS },
        min: { c: 21.5, t: MONDAY_PREMARKET_MS },
      },
      MONDAY_PREMARKET_MS,
      "minute_close",
    );
    expect(evidence.basis).toBe("minute_aggregate");
    expect(evidence.providerAsOfMs).toBe(MONDAY_PREMARKET_MS);
    expect(evidence.providerAsOfMs).not.toBe(MONDAY_TRADE_MS);
  });

  it("does not borrow a last-trade timestamp when minute close is displayed", () => {
    const displayed = resolveDisplayedPriceSource("premarket", 0, 21.5, null);
    expect(displayed).toBe("minute_close");
    const mover = moverFromPolygonTicker({
      ticker: "MINONLY",
      todaysChangePerc: 2,
      prevDay: { c: 20 },
      lastTrade: { p: 0, t: MONDAY_TRADE_MS },
      min: { c: 21.5, t: MONDAY_PREMARKET_MS },
    }, "premarket", MONDAY_PREMARKET_MS);
    expect(mover.observation_basis).toBe("minute_aggregate");
    expect(Date.parse(mover.provider_as_of ?? "")).toBe(MONDAY_PREMARKET_MS);
  });

  it("discloses unavailable observation time when displayed price lacks a timestamp", () => {
    const mover = moverFromPolygonTicker({
      ticker: "NOTIME",
      todaysChangePerc: 2,
      prevDay: { c: 20 },
      lastTrade: { p: 21.2 },
      min: { c: 21.1 },
    }, "premarket", MONDAY_PREMARKET_MS);
    const row = toMoverListRow(mover);
    expect(row?.priceObservationTimeUnavailable).toBe(true);
    expect(row?.priceObservationLine).toMatch(/Observation time unavailable/);
    expect(row?.priceObservationLine).toMatch(/Last trade/);
  });

  it("does not duplicate EST/EDT in formatted observation strings", () => {
    const formatted = formatMoverObservationEt(MONDAY_PREMARKET_MS);
    expect(formatted).not.toMatch(/EDT EDT|EST EST/i);
    expect(formatted).toMatch(/EDT|EST/);
  });

  it("detects prior-session Friday day bar on Monday premarket through mapper and provenance", () => {
    const { movers } = mapPolygonMoversDetailed([fridayRegularTicker()], "regular", {
      nowMs: MONDAY_PREMARKET_MS,
    });
    expect(movers[0]?.session_date).toBe("2026-08-28");
    const summary = summarizeMoversListProvenance(movers, {
      nowMs: MONDAY_PREMARKET_MS,
      universe: "top_gainers",
      moverSession: "regular",
    });
    expect(summary.isPriorSession).toBe(true);
    expect(summary.sessionDateMode).toBe("homogeneous_prior");
    expect(summary.sessionLine).toMatch(/Prior source session/);
  });

  it("uses day aggregate timestamp for regular price, not fresher last trade", () => {
    const mover = moverFromPolygonTicker(fridayRegularTicker({
      lastTrade: { p: 25, t: MONDAY_TRADE_MS },
      min: { c: 25, t: MONDAY_TRADE_MS },
    }), "regular", MONDAY_PREMARKET_MS);
    expect(mover.observation_basis).toBe("day_aggregate");
    expect(Date.parse(mover.provider_as_of ?? "")).toBe(FRIDAY_DAY_MS);
    const row = toMoverListRow(mover);
    expect(row?.priceObservationLine).toMatch(/Daily bar/);
    expect(row?.priceObservationLine).not.toContain("Last trade");
  });

  it("reports mixed list observation times when volume leader is stale and tail is fresh", () => {
    const stale = moverFromPolygonTicker(fridayRegularTicker({ ticker: "STALE", day: { c: 21, v: 9_000_000, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    const fresh = moverFromPolygonTicker(fridayRegularTicker({
      ticker: "FRESH",
      todaysChangePerc: 10,
      day: { c: 22, v: 100_000, t: MONDAY_PREMARKET_MS },
      prevDay: { c: 20 },
      lastTrade: { p: 22, t: MONDAY_PREMARKET_MS },
      min: { c: 22, t: MONDAY_PREMARKET_MS },
    }), "regular", MONDAY_PREMARKET_MS);
    const aggregate = summarizeListObservationTimes([stale, fresh]);
    expect(aggregate.mixed).toBe(true);
    expect(aggregate.line).toMatch(/Observations from/);
    expect(aggregate.line).toMatch(/vary by symbol/);
  });

  it("does not show a single list As-of when some symbols lack verified observation times", () => {
    const timed = moverFromPolygonTicker(fridayRegularTicker({ ticker: "TIMED" }), "regular", MONDAY_PREMARKET_MS);
    const untimed = moverFromPolygonTicker({
      ticker: "UNTIMED",
      todaysChangePerc: 3,
      day: { c: 19, v: 500_000 },
      prevDay: { c: 18 },
      lastTrade: { p: 19 },
    }, "regular", MONDAY_PREMARKET_MS);
    const aggregate = summarizeListObservationTimes([timed, untimed]);
    expect(aggregate.partiallyUntimed).toBe(true);
    expect(aggregate.line).toMatch(/lack verified observation times/);
    expect(aggregate.line).not.toMatch(/^As of /);
  });

  it("labels mixed source sessions without forcing prior-session copy for a current majority", () => {
    const prior = moverFromPolygonTicker(fridayRegularTicker({ ticker: "OLD", day: { c: 21, v: 100, t: FRIDAY_DAY_MS } }), "regular", MONDAY_PREMARKET_MS);
    const current = moverFromPolygonTicker(fridayRegularTicker({
      ticker: "NOW1",
      day: { c: 22, v: 9_000_000, t: MONDAY_PREMARKET_MS },
      prevDay: { c: 20 },
      lastTrade: { p: 22, t: MONDAY_PREMARKET_MS },
    }), "regular", MONDAY_PREMARKET_MS);
    const current2 = moverFromPolygonTicker(fridayRegularTicker({
      ticker: "NOW2",
      day: { c: 23, v: 8_000_000, t: MONDAY_PREMARKET_MS },
      prevDay: { c: 20 },
      lastTrade: { p: 23, t: MONDAY_PREMARKET_MS },
    }), "regular", MONDAY_PREMARKET_MS);
    const session = summarizeSessionDates([prior, current, current2], "regular", MONDAY_PREMARKET_MS);
    expect(session.mode).toBe("mixed");
    const summary = summarizeMoversListProvenance([prior, current, current2], {
      nowMs: MONDAY_PREMARKET_MS,
      universe: "top_gainers",
      moverSession: "regular",
    });
    expect(summary.isPriorSession).toBe(false);
    expect(summary.sessionLine).toMatch(/Mixed source sessions/);
    expect(summary.sessionLine).not.toMatch(/Prior source session · 2026-08-28/);
  });

  it("labels an afternoon premarket tab as ended instead of the regular-session clock alone", () => {
    const afternoon = Date.parse("2026-10-26T17:12:00.000Z");
    const summary = summarizeMoversListProvenance([], {
      nowMs: afternoon,
      universe: "top_gainers",
      moverSession: "premarket",
      premarket: true,
    });
    expect(summary.sessionLine).toMatch(/Premarket session ended/);
    expect(summary.sessionLine).toMatch(/regular-session snapshots are not listed here/);
    expect(summary.universeDetail).toMatch(/4:00–9:30 a.m. ET/);
    expect(summary.universeDetail).toMatch(/delayed/);
    expect(moversSuccessfulEmptyMessage({
      marketClosed: false,
      premarket: true,
      clockSession: "market",
    })).toMatch(/Premarket has ended/);
  });
});
