import { describe, expect, it } from "vitest";
import type { CatalystEvent } from "@/types/catalyst";
import {
  classifyLifecycle,
  comparePrices,
  compareShadowRank,
  closedPremarketGate,
  cumulativeShares,
  daySessionMovePct,
  evaluatePremarketShadow,
  filterPremarketBars,
  formatPremarketShadowReport,
  hodDistancePct,
  inPremarketBarWindow,
  lastTradeMovePct,
  minCloseMovePct,
  notApplicableReport,
  productionExclusion,
  qualifyDayTradeRadar,
  qualifyPremarketShadow,
  resolvePremarketGate,
  volumeWindows,
  type EvaluateInput,
  type MinuteBar,
  type PremarketWindow,
  type SnapshotTicker,
} from "@/lib/premarket-radar-shadow";
import { fallbackOpenSchedule } from "@/lib/equities-session-calendar";

/** Wednesday 06:45 ET (EDT). */
const CAPTURE_MS = Date.parse("2026-08-26T10:45:00.000Z");
/** 04:00 ET. */
const PRE_START = Date.parse("2026-08-26T08:00:00.000Z");
/** 09:30 ET. */
const RTH_OPEN = Date.parse("2026-08-26T13:30:00.000Z");
/** Wednesday 16:07 ET — after hours. */
const AFTER_CLOSE_MS = Date.parse("2026-08-26T20:07:00.000Z");
/** Saturday 08:00 ET. */
const WEEKEND_MS = Date.parse("2026-08-29T12:00:00.000Z");
/** Friday 2026-07-03 06:45 ET — Independence Day observed. */
const HOLIDAY_MS = Date.parse("2026-07-03T10:45:00.000Z");

function windowAt(captureMs: number): PremarketWindow {
  return {
    sessionDate: "2026-08-26",
    etTimeLabel: "2026-08-26 06:45 ET",
    captureMs,
    windowStartMs: PRE_START,
    windowEndExclusiveMs: RTH_OPEN,
    schedule: fallbackOpenSchedule("2026-08-26"),
    calendarSource: "weekend_fallback_calendar_unavailable",
  };
}

function bar(t: number, v: number, extra: Partial<MinuteBar> = {}): MinuteBar {
  return { t, v, c: extra.c ?? 10, h: extra.h ?? extra.c ?? 10, vw: extra.vw ?? extra.c ?? 10 };
}

function ticker(symbol: string, extra: Partial<SnapshotTicker> = {}): SnapshotTicker {
  return {
    ticker: symbol,
    updated: CAPTURE_MS * 1_000_000,
    todaysChangePerc: extra.todaysChangePerc,
    day: extra.day ?? { c: 10.04, v: 8_000_000 },
    prevDay: extra.prevDay ?? { c: 10, v: 1_000_000 },
    lastTrade: extra.lastTrade ?? { p: 18.4, t: CAPTURE_MS * 1_000_000 },
    min: extra.min ?? { c: 18.2, t: CAPTURE_MS * 1_000_000, v: 50_000, av: 4_000_000 },
    ...extra,
  };
}

function catalyst(symbol: string, title = "Contract announcement"): CatalystEvent {
  return {
    id: `evt-${symbol}`,
    dedupe_key: `dk-${symbol}`,
    symbol,
    company_name: symbol,
    event_type: "product_contract",
    verification_state: "provider_reported",
    event_date: "2026-08-26",
    event_time: "2026-08-26T10:03:00.000Z",
    time_of_day: "before_open",
    title,
    description: null,
    source_name: "Provider",
    source_url: null,
    provider: "test",
    related_symbols: [],
    facts: {},
    published_at: "2026-08-26T10:03:00.000Z",
  };
}

function evaluate(partial: Partial<EvaluateInput> & { tickers: SnapshotTicker[] }): ReturnType<typeof evaluatePremarketShadow> {
  return evaluatePremarketShadow({
    window: windowAt(CAPTURE_MS),
    barsBySymbol: new Map(),
    persistedScreener: [],
    persistedScreenerError: null,
    catalysts: [],
    nowMs: CAPTURE_MS,
    ...partial,
  });
}

describe("pre-market vs day-session price calculations", () => {
  const t = ticker("ABC", {
    day: { c: 10.04, v: 100 },
    prevDay: { c: 10, v: 100 },
    lastTrade: { p: 20.8 },
    min: { c: 20.5 },
  });

  it("uses (day.c - prevDay.c) / prevDay.c for the existing day-session definition", () => {
    expect(daySessionMovePct(t)).toBeCloseTo(0.4, 5);
  });

  it("uses (lastTrade.p - prevDay.c) / prevDay.c for extended hours", () => {
    expect(lastTradeMovePct(t)).toBeCloseTo(108, 5);
  });

  it("uses (min.c - prevDay.c) / prevDay.c when minute close is supplied", () => {
    expect(minCloseMovePct(t)).toBeCloseTo(105, 5);
  });

  it("does not substitute day.c as the extended-hours price", () => {
    const prices = comparePrices(t);
    expect(prices.extendedPrice).toBe(20.8);
    expect(prices.extendedPriceSource).toBe("lastTrade.p");
    expect(prices.extendedMovePct).toBeCloseTo(108, 5);
  });

  it("falls back to min.c when lastTrade.p is missing", () => {
    const prices = comparePrices(ticker("ABC", { lastTrade: undefined, min: { c: 12 } }));
    expect(prices.extendedPrice).toBe(12);
    expect(prices.extendedPriceSource).toBe("min.c");
  });

  it("records missing extended price without substituting day.c", () => {
    const prices = comparePrices(
      ticker("ABC", { lastTrade: undefined, min: undefined, day: { c: 15, v: 1 } }),
    );
    expect(prices.dayC).toBe(15);
    expect(prices.extendedPrice).toBeNull();
    expect(prices.extendedPriceSource).toBeNull();
  });
});

describe("bar-derived 04:00 cumulative volume and session boundaries", () => {
  const mixed: MinuteBar[] = [
    bar(Date.parse("2026-08-25T19:00:00.000Z"), 9_000_000), // prior RTH
    bar(Date.parse("2026-08-26T07:59:00.000Z"), 8_000_000), // 03:59 ET
    bar(PRE_START, 1_000),
    bar(Date.parse("2026-08-26T10:44:00.000Z"), 500),
    bar(CAPTURE_MS, 7_000_000), // capture instant excluded
    bar(RTH_OPEN, 6_000_000),
    bar(RTH_OPEN + 60_000, 5_000_000),
  ];

  it("keeps only [04:00 ET, min(capture, 09:30 ET)) and sums those shares", () => {
    const kept = filterPremarketBars(mixed, windowAt(CAPTURE_MS));
    expect(kept.map((b) => b.v)).toEqual([1_000, 500]);
    expect(cumulativeShares(kept)).toBe(1_500);
  });

  it("rejects previous-day contamination", () => {
    expect(inPremarketBarWindow(mixed[0].t, PRE_START, RTH_OPEN, CAPTURE_MS)).toBe(false);
  });

  it("rejects bars at or after regular open", () => {
    expect(inPremarketBarWindow(RTH_OPEN, PRE_START, RTH_OPEN, CAPTURE_MS)).toBe(false);
  });
});

describe("5/15/30/60-minute windows", () => {
  it("sums lookbacks against the capture clock", () => {
    const bars: MinuteBar[] = [];
    for (let i = 1; i <= 60; i++) {
      bars.push(bar(CAPTURE_MS - i * 60_000, i === 3 ? 100 : 10));
    }
    const w = volumeWindows(bars, CAPTURE_MS);
    expect(w.vol5).toBe(10 + 10 + 100 + 10 + 10);
    expect(w.vol15).toBe(10 * 14 + 100);
    expect(w.vol30).toBe(10 * 29 + 100);
    expect(w.vol60).toBe(10 * 59 + 100);
    expect(w.accel15).not.toBeNull();
  });
});

describe("session gate: holiday / weekend / outside window", () => {
  it("returns not-applicable after 09:30 ET", () => {
    const gate = resolvePremarketGate(AFTER_CLOSE_MS, []);
    const closed = closedPremarketGate(gate);
    expect(closed?.reason).toBe("outside_window");
  });

  it("returns weekend on Saturday", () => {
    const gate = resolvePremarketGate(WEEKEND_MS, []);
    const closed = closedPremarketGate(gate);
    expect(closed?.reason).toBe("weekend");
  });

  it("returns holiday when the static holiday list is the fallback", () => {
    const gate = resolvePremarketGate(HOLIDAY_MS, null);
    const closed = closedPremarketGate(gate);
    expect(closed).not.toBeNull();
    expect(["holiday", "closed_day"]).toContain(closed?.reason);
  });

  it("accepts 06:45 ET on a weekday", () => {
    const gate = resolvePremarketGate(CAPTURE_MS, []);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.window.windowStartMs).toBe(PRE_START);
      expect(gate.window.windowEndExclusiveMs).toBe(RTH_OPEN);
    }
  });
});

describe("stale and missing provider fields", () => {
  it("flags stale when the provider timestamp is older than 20 minutes", () => {
    const staleMs = CAPTURE_MS - 45 * 60_000;
    const report = evaluate({
      tickers: [
        ticker("OLD", {
          updated: staleMs * 1_000_000,
          lastTrade: { p: 12, t: staleMs * 1_000_000 },
        }),
      ],
      barsBySymbol: new Map([
        ["OLD", [bar(PRE_START, 100_000, { c: 12 })]],
      ]),
    });
    expect(report.shadowTop[0].qualityFlags).toContain("stale");
  });

  it("flags missing when extended price and bars are absent", () => {
    const report = evaluate({
      tickers: [
        ticker("GAP", {
          lastTrade: undefined,
          min: undefined,
          day: { c: 10, v: 1 },
        }),
      ],
    });
    const row = report.missingData.find((c) => c.symbol === "GAP");
    expect(row).toBeDefined();
    expect(row?.qualityFlags).toContain("missing");
    expect(row?.price).toBeNull();
  });

  it("flags provider-ambiguous when day.c and lastTrade.p diverge", () => {
    const report = evaluate({
      tickers: [ticker("ABC")],
      barsBySymbol: new Map([["ABC", [bar(PRE_START, 1_000_000, { c: 18.4 })]]]),
    });
    expect(report.shadowQualifiedTop[0].qualityFlags).toContain("provider-ambiguous");
  });
});

describe("cumulative-volume sorting", () => {
  it("sorts by bar-derived shares DESC then dollar volume DESC", () => {
    const a = { symbol: "AAA", cumulativeVolume: 2_000_000, cumulativeDollarVolume: 10 };
    const b = { symbol: "BBB", cumulativeVolume: 2_000_000, cumulativeDollarVolume: 50 };
    const c = { symbol: "CCC", cumulativeVolume: 3_000_000, cumulativeDollarVolume: 1 };
    const ranked = [a, b, c].sort(compareShadowRank);
    expect(ranked.map((r) => r.symbol)).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("does not let catalysts change rank", () => {
    const report = evaluate({
      tickers: [
        ticker("ABC", { lastTrade: { p: 12 } }),
        ticker("XYZ", { lastTrade: { p: 12 } }),
      ],
      barsBySymbol: new Map([
        ["ABC", [bar(PRE_START, 2_000_000, { c: 12 })]],
        ["XYZ", [bar(PRE_START, 1_000_000, { c: 12 })]],
      ]),
      catalysts: [catalyst("XYZ")],
    });
    expect(report.shadowQualifiedTop[0].symbol).toBe("ABC");
    expect(report.shadowQualifiedTop[0].catalyst.present).toBe(false);
    expect(report.shadowQualifiedTop[1].symbol).toBe("XYZ");
    expect(report.shadowQualifiedTop[1].catalyst.present).toBe(true);
    expect(report.shadowQualifiedTop[1].catalyst.title).toBe("Contract announcement");
  });
});

describe("production exclusion-reason reporting", () => {
  it("explains a blank production list when day.c is flat and lastTrade has moved", () => {
    const t = ticker("ABC", {
      day: { c: 10.04, v: 1_200_000 },
      prevDay: { c: 10, v: 1_000_000 },
      lastTrade: { p: 18.4 },
    });
    const dtr = qualifyDayTradeRadar(t);
    expect(dtr.ok).toBe(false);
    const shadow = qualifyPremarketShadow({
      ticker: t,
      priceComp: comparePrices(t),
      volumeComp: {
        dayV: 1_200_000,
        prevDayV: 1_000_000,
        priorSessionRatio: 1.2,
        minuteV: null,
        minuteAv: null,
        barCumulative: 4_000_000,
        barDollarVolume: 80_000_000,
        vol5: 100_000,
        vol15: 400_000,
        vol30: 800_000,
        vol60: 1_200_000,
        recentShare15: 0.1,
        accel15: 1,
        dayVOverBar: 0.3,
      },
    });
    expect(shadow.ok).toBe(true);
    const exclusion = productionExclusion("ABC", dtr, comparePrices(t));
    expect(exclusion.summary).toContain("day.c move=0.40%");
    expect(exclusion.summary).toContain("last extended-hours price move=84.00%");
    expect(exclusion.lostToPriorSessionRatioOnly).toBe(false);
  });

  it("records names lost specifically because of the prior-session ratio", () => {
    const t = ticker("RATIO", {
      day: { c: 12, v: 4_000_000 },
      prevDay: { c: 10, v: 1_000_000 },
      lastTrade: { p: 12 },
    });
    const dtr = qualifyDayTradeRadar(t);
    expect(dtr.ok).toBe(false);
    expect(dtr.movePct).toBeCloseTo(20, 5);
    expect(dtr.ratio).toBeCloseTo(4, 5);
    const exclusion = productionExclusion("RATIO", dtr, comparePrices(t));
    expect(exclusion.lostToPriorSessionRatioOnly).toBe(true);
    expect(exclusion.summary).toContain("prior-session ratio");
  });

  it("puts the exclusion on the capture report", () => {
    const report = evaluate({
      tickers: [
        ticker("ABC", {
          day: { c: 10.04, v: 1_200_000 },
          prevDay: { c: 10, v: 1_000_000 },
          lastTrade: { p: 12 },
        }),
      ],
      barsBySymbol: new Map([["ABC", [bar(PRE_START, 4_000_000, { c: 12 })]]]),
    });
    expect(report.productionLiveDtrTop3).toEqual([]);
    expect(report.shadowQualifiedTop[0].symbol).toBe("ABC");
    expect(report.productionExclusions[0].summary).toContain("ABC");
    expect(report.productionExclusions[0].summary).toContain("day.c move");
  });
});

describe("lifecycle classification", () => {
  it("labels DORMANT when recent share of cumulative volume is tiny", () => {
    expect(
      classifyLifecycle(
        {
          dayV: null,
          prevDayV: null,
          priorSessionRatio: null,
          minuteV: null,
          minuteAv: null,
          barCumulative: 10_000_000,
          barDollarVolume: 1,
          vol5: 1_000,
          vol15: 10_000,
          vol30: 20_000,
          vol60: 40_000,
          recentShare15: 0.001,
          accel15: 1,
          dayVOverBar: null,
        },
        1,
      ),
    ).toBe("DORMANT");
  });

  it("labels FADING when recent volume is low and price is off HOD", () => {
    expect(
      classifyLifecycle(
        {
          dayV: null,
          prevDayV: null,
          priorSessionRatio: null,
          minuteV: null,
          minuteAv: null,
          barCumulative: 10_000_000,
          barDollarVolume: 1,
          vol5: 100_000,
          vol15: 400_000,
          vol30: 2_000_000,
          vol60: 4_000_000,
          recentShare15: 0.04,
          accel15: 0.25,
          dayVOverBar: null,
        },
        5,
      ),
    ).toBe("FADING");
  });

  it("computes HOD distance from the bar high", () => {
    expect(hodDistancePct(18.4, 21.3)).toBeCloseTo(((21.3 - 18.4) / 21.3) * 100, 5);
  });
});

describe("report formatting", () => {
  it("prints production vs shadow tops and exclusion reasons", () => {
    const report = evaluate({
      tickers: [
        ticker("ABC", {
          day: { c: 10.04, v: 1_200_000 },
          prevDay: { c: 10, v: 1_000_000 },
          lastTrade: { p: 18.4 },
        }),
      ],
      barsBySymbol: new Map([["ABC", [bar(PRE_START, 18_400_000, { c: 18.4, vw: 18.4 })]]]),
      persistedScreener: [],
      catalysts: [catalyst("ABC")],
    });
    const text = formatPremarketShadowReport(report);
    expect(text).toContain("AM SHADOW —");
    expect(text).toContain("Current production Day-Trade Radar:");
    expect(text).toContain("Pre-Market shadow by cumulative volume:");
    expect(text).toContain("ABC");
    expect(text).toContain("Production misses:");
    expect(text).toContain("excluded because");
    expect(text).not.toContain("Claude");
  });

  it("prints not-applicable outside the window", () => {
    const gate = resolvePremarketGate(AFTER_CLOSE_MS, []);
    const closed = closedPremarketGate(gate);
    expect(closed).not.toBeNull();
    if (!closed) return;
    const text = formatPremarketShadowReport(notApplicableReport(closed, AFTER_CLOSE_MS));
    expect(text).toContain("status=not_applicable");
    expect(text).toContain("outside_window");
  });
});
