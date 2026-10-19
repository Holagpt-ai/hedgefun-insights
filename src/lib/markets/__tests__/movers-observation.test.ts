import { describe, expect, it } from "vitest";
import {
  formatMoverObservationEt,
  resolvePolygonMoverSourceEvidence,
} from "@/lib/markets/movers-observation";
import { moverFromPolygonTicker, mapPolygonMoversDetailed, toMoverListRow } from "@/lib/markets/movers-integrity";
import {
  summarizeListObservationTimes,
  summarizeMoversListProvenance,
} from "@/lib/markets/movers-provenance";

const FRIDAY_DAY_MS = Date.parse("2026-08-28T20:00:00.000Z");
const MONDAY_PREMARKET_MS = Date.parse("2026-08-31T12:00:00.000Z");

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
    );
    expect(evidence.sessionDate).toBe("2026-08-28");
    expect(evidence.basis).toBe("day_aggregate");
    expect(evidence.providerAsOfMs).toBe(FRIDAY_DAY_MS);
  });

  it("marks missing day.t as unverified for regular movers", () => {
    const evidence = resolvePolygonMoverSourceEvidence("regular", { day: { c: 21, v: 1 } }, MONDAY_PREMARKET_MS);
    expect(evidence.sessionDate).toBeNull();
    expect(evidence.sessionDateUnverified).toBe(true);
  });

  it("uses last trade ET session date in premarket", () => {
    const evidence = resolvePolygonMoverSourceEvidence(
      "premarket",
      { lastTrade: { p: 21, t: MONDAY_PREMARKET_MS }, min: { c: 21 } },
      MONDAY_PREMARKET_MS,
    );
    expect(evidence.basis).toBe("last_trade");
    expect(evidence.sessionDate).toBe("2026-08-31");
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
    expect(summary.sessionLine).toMatch(/Prior source session/);
  });

  it("uses day aggregate timestamp for regular price, not fresher last trade", () => {
    const mover = moverFromPolygonTicker(fridayRegularTicker(), "regular", MONDAY_PREMARKET_MS);
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
});
