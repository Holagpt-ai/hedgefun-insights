import { describe, expect, it } from "vitest";
import {
  afterHoursChangePercent,
  classifyTrackedAfterHoursMovers,
  extendedLast,
  extendedTotalChangePercent,
  previousRegularClose,
  providerDayVolume,
  providerPreviousDayVolume,
  regularChangePercent,
  regularClose,
  sessionMetrics,
  type SnapshotTicker,
} from "@/lib/market-session";
import { computeHodDistancePercent } from "@/features/day-trade-radar-v2/radar-metrics";

/** Wednesday Aug 12, 2026 6:45 PM Eastern (EDT). */
const AH_REF_MS = Date.parse("2026-08-12T22:45:00.000Z");

function boxlFixture(): SnapshotTicker {
  return {
    ticker: "BOXL",
    name: "Boxlight",
    // Misleading total-session change vs prior close — must NOT be used with day.c.
    todaysChangePerc: 132.42,
    todaysChange: 3.88,
    day: { c: 7.87, o: 4.565, h: 9.89, l: 4.2768, v: 65_500_000 },
    prevDay: { c: 2.93, v: 5_409_723 },
    min: { c: 6.8, t: AH_REF_MS, v: 2_890, av: 65_500_000 },
    updated: AH_REF_MS * 1_000_000,
  };
}

function wenFixture(): SnapshotTicker {
  return {
    ticker: "WEN",
    name: "Wendy's",
    todaysChangePerc: 14.7,
    day: { c: 8.66, o: 7.8, h: 8.8, l: 7.5, v: 44_900_000 },
    prevDay: { c: 7.55, v: 7_920_257 },
    min: { c: 8.66, t: AH_REF_MS, v: 100, av: 44_900_000 },
    updated: AH_REF_MS * 1_000_000,
  };
}

function xhldFixture(): SnapshotTicker {
  return {
    ticker: "XHLD",
    name: "TEN Holdings",
    todaysChangePerc: 37.0,
    day: { c: 5.35, o: 4.0, h: 6.26, l: 3.93, v: 21_700_000 },
    prevDay: { c: 3.57, v: 4_325_624 },
    min: { c: 4.89, t: AH_REF_MS, v: 500, av: 21_700_000 },
    updated: AH_REF_MS * 1_000_000,
  };
}

describe("market-session coherence fixtures", () => {
  it("BOXL: Radar regular-session LAST/MOVE and HOD; AH loser classification", () => {
    const t = boxlFixture();
    expect(regularClose(t)).toBe(7.87);
    expect(previousRegularClose(t)).toBe(2.93);
    expect(regularChangePercent(t)).toBeCloseTo(168.6, 1);
    expect(computeHodDistancePercent(7.87, 9.89)).toBeCloseTo(20.4, 1);

    expect(extendedLast(t, AH_REF_MS)).toBeCloseTo(6.8, 5);
    expect(afterHoursChangePercent(t, AH_REF_MS)).toBeCloseTo(-13.6, 1);
    expect(extendedTotalChangePercent(t, AH_REF_MS)).toBeCloseTo(132.08, 0);

    const { gainers, losers } = classifyTrackedAfterHoursMovers([t], AH_REF_MS);
    expect(gainers.find((r) => r.symbol === "BOXL")).toBeUndefined();
    const loser = losers.find((r) => r.symbol === "BOXL");
    expect(loser).toBeDefined();
    expect(loser!.price).toBeCloseTo(6.8, 5);
    expect(loser!.changePercent).toBeCloseTo(-13.6, 1);

    const dayVol = providerDayVolume(t)!;
    const priorVol = providerPreviousDayVolume(t)!;
    expect(dayVol / priorVol).toBeCloseTo(12.1, 1);
  });

  it("WEN: regular and extended remain coherent when extended ≈ close", () => {
    const t = wenFixture();
    expect(regularClose(t)).toBe(8.66);
    expect(regularChangePercent(t)).toBeCloseTo(14.702, 2);
    expect(extendedLast(t, AH_REF_MS)).toBe(8.66);
    expect(afterHoursChangePercent(t, AH_REF_MS)).toBeCloseTo(0, 5);
    const { gainers, losers } = classifyTrackedAfterHoursMovers([t], AH_REF_MS);
    // Zero AH move is excluded from both lists.
    expect(gainers.find((r) => r.symbol === "WEN")).toBeUndefined();
    expect(losers.find((r) => r.symbol === "WEN")).toBeUndefined();
  });

  it("XHLD: session-mixing defect is corrected", () => {
    const t = xhldFixture();
    expect(regularClose(t)).toBe(5.35);
    expect(regularChangePercent(t)).toBeCloseTo(49.86, 1);
    // Provider todaysChangePerc (~37) must not be used as Radar MOVE.
    expect(regularChangePercent(t)).not.toBeCloseTo(37, 0);
    expect(afterHoursChangePercent(t, AH_REF_MS)).toBeCloseTo(-8.6, 0);
    const { losers } = classifyTrackedAfterHoursMovers([t], AH_REF_MS);
    expect(losers.find((r) => r.symbol === "XHLD")?.changePercent).toBeLessThan(0);
  });
});

describe("market-session invariants", () => {
  it("day-session rows never pair day.c with todaysChangePerc", () => {
    for (const t of [boxlFixture(), wenFixture(), xhldFixture()]) {
      const metrics = sessionMetrics(t, AH_REF_MS);
      expect(metrics.regular_close).toBe(t.day!.c);
      expect(metrics.regular_change_pct).toBeCloseTo(
        ((t.day!.c! - t.prevDay!.c!) / t.prevDay!.c!) * 100,
        5,
      );
      expect(metrics.regular_change_pct).not.toBe(t.todaysChangePerc);
    }
  });

  it("after-hours rows satisfy (extended_last - regular_close) / regular_close", () => {
    const mixed = [boxlFixture(), xhldFixture()];
    const { gainers, losers } = classifyTrackedAfterHoursMovers(mixed, AH_REF_MS);
    for (const row of [...gainers, ...losers]) {
      const expected =
        ((row.extended_last - row.regular_close) / row.regular_close) * 100;
      expect(row.after_hours_change_pct).toBeCloseTo(expected, 8);
      expect(row.changePercent).toBe(row.after_hours_change_pct);
      expect(row.price).toBe(row.extended_last);
    }
    expect(gainers.every((r) => r.after_hours_change_pct > 0)).toBe(true);
    expect(losers.every((r) => r.after_hours_change_pct < 0)).toBe(true);
  });

  it("excludes candidates without verified after-hours timestamps", () => {
    const noAhTs: SnapshotTicker = {
      ticker: "FAKE",
      day: { c: 10, v: 1_000_000 },
      prevDay: { c: 9, v: 100_000 },
      min: { c: 11, t: Date.parse("2026-08-12T15:00:00.000Z") }, // before AH
      todaysChangePerc: 50,
    };
    const { gainers, losers } = classifyTrackedAfterHoursMovers([noAhTs], AH_REF_MS);
    expect(gainers).toHaveLength(0);
    expect(losers).toHaveLength(0);
  });

  it("excludes candidates missing regular close rather than fabricating", () => {
    const missingClose: SnapshotTicker = {
      ticker: "NOCL",
      day: { v: 1_000_000 },
      prevDay: { c: 9, v: 100_000 },
      min: { c: 11, t: AH_REF_MS },
      todaysChangePerc: 50,
    };
    const { gainers, losers } = classifyTrackedAfterHoursMovers(
      [missingClose],
      AH_REF_MS,
    );
    expect(gainers).toHaveLength(0);
    expect(losers).toHaveLength(0);
    expect(regularClose(missingClose)).toBeNull();
    expect(regularChangePercent(missingClose)).toBeNull();
  });

  it("volume ratio remains provider day / provider previous day", () => {
    const t = boxlFixture();
    const ratio =
      providerDayVolume(t)! / providerPreviousDayVolume(t)!;
    expect(ratio).toBeCloseTo(65_500_000 / 5_409_723, 8);
  });
});
