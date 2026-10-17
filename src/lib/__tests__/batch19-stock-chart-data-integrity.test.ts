import { describe, expect, it, vi } from "vitest";
import {
  estTimezoneAbbr,
  formatPriceObservationTime,
  formatStockHeaderSessionLine,
  resolveMarketSession,
  resolveStockHeaderPriceState,
  stockHeaderPriceSourceLabel,
} from "@/lib/price-utils";
import { resolveChartAggregateRequest } from "@/lib/stock-chart/chart-ranges";
import {
  chartSeriesMeta,
  normalizeAggregateBars,
  toOhlcvSeries,
} from "@/lib/stock-chart/normalize-bars";
import { createRequestFence } from "@/lib/stock-chart/request-fence";

describe("Batch 19 — intraday chart integrity", () => {
  it("keeps multiple intraday bars on one date as distinct UTC timestamps", () => {
    const bars = normalizeAggregateBars([
      { t: Date.parse("2026-03-16T14:00:00.000Z"), o: 1, h: 2, l: 1, c: 1.5, v: 100 },
      { t: Date.parse("2026-03-16T14:05:00.000Z"), o: 1.5, h: 2.1, l: 1.4, c: 2, v: 120 },
    ]);
    const series = toOhlcvSeries(bars, "intraday");
    expect(series.map((b) => b.time)).toEqual([
      Math.floor(Date.parse("2026-03-16T14:00:00.000Z") / 1000),
      Math.floor(Date.parse("2026-03-16T14:05:00.000Z") / 1000),
    ]);
    expect(new Set(series.map((b) => b.time)).size).toBe(2);
  });

  it("sorts unsorted bars and dedupes duplicate timestamps", () => {
    const bars = normalizeAggregateBars([
      { t: 3000, o: 2, h: 3, l: 2, c: 2.5, v: 10 },
      { t: 1000, o: 1, h: 2, l: 1, c: 1.5, v: 5 },
      { t: 3000, o: 9, h: 10, l: 9, c: 9.5, v: 99 },
      { t: 2000, o: 0, h: 1, l: 0, c: 0, v: 1 },
    ]);
    expect(bars.map((b) => b.utcMs)).toEqual([1000, 3000]);
    expect(bars[1].close).toBe(9.5);
  });

  it("uses minute aggregates for 1D and 5D labels", () => {
    const oneDay = resolveChartAggregateRequest("1D");
    expect(oneDay.timespan).toBe("minute");
    expect(oneDay.granularity).toBe("intraday");

    const fiveDay = resolveChartAggregateRequest("5D");
    expect(fiveDay.timespan).toBe("minute");
    expect(fiveDay.granularity).toBe("intraday");
  });

  it("uses daily dates for daily granularity series", () => {
    const bars = normalizeAggregateBars([
      { t: Date.parse("2026-03-16T05:00:00.000Z"), o: 1, h: 2, l: 1, c: 1.5, v: 100 },
    ]);
    const series = toOhlcvSeries(bars, "daily");
    expect(series[0].time).toBe("2026-03-16");
  });

  it("surfaces chart as-of metadata without fabricating bars", () => {
    const bars = normalizeAggregateBars([]);
    const meta = chartSeriesMeta(bars, "intraday", true);
    expect(meta.barCount).toBe(0);
    expect(meta.usesPriorSessionFallback).toBe(true);
  });
});

describe("Batch 19 — quote provenance and session labels", () => {
  it("separates extended-session price from prior close reference", () => {
    const state = resolveStockHeaderPriceState({
      prevDay: { c: 10 },
      lastTrade: { p: 11, t: Date.parse("2026-03-16T12:00:00.000Z") },
      todaysChangePerc: 99,
    }, "pre-market");
    expect(state.displayedPrice).toBe(11);
    expect(state.referencePrice).toBe(10);
    expect(state.basis).toBe("extended_vs_prior_close");
    expect(stockHeaderPriceSourceLabel(state.timestampSource)).toBe("Last trade");
  });

  it("does not fabricate percentage when extended print is missing", () => {
    const state = resolveStockHeaderPriceState({
      prevDay: { c: 10 },
      todaysChangePerc: 5,
    }, "pre-market");
    expect(state.changePercent).toBeNull();
  });

  it("formats observation time only when provider timestamp exists", () => {
    const withTs = formatPriceObservationTime(
      { lastTrade: { p: 11, t: Date.parse("2026-03-16T12:00:00.000Z") } },
      "lastTrade",
    );
    expect(withTs).toMatch(/As of/);
    expect(withTs).toMatch(/15-minute delayed/);

    expect(formatPriceObservationTime({ lastTrade: { p: 11 } }, "lastTrade")).toBeNull();
  });

  it("classifies weekends and holidays as closed", () => {
    const laborDay = new Date("2026-09-07T15:00:00.000Z");
    expect(resolveMarketSession(laborDay)).toBe("closed");
    expect(formatStockHeaderSessionLine(laborDay)).toMatch(/Labor Day/);
  });

  it("uses EST in winter and EDT in summer", () => {
    expect(estTimezoneAbbr(new Date("2026-01-15T18:00:00.000Z"))).toBe("EST");
    expect(estTimezoneAbbr(new Date("2026-07-15T18:00:00.000Z"))).toBe("EDT");
  });
});

describe("Batch 19 — request isolation", () => {
  it("drops stale ticker responses after a newer request starts", () => {
    const fence = createRequestFence();
    const first = fence.bump();
    const second = fence.bump();
    expect(fence.isCurrent(first)).toBe(false);
    expect(fence.isCurrent(second)).toBe(true);
  });

  it("simulates late ticker A finishing after ticker B was selected", async () => {
    const fence = createRequestFence();
    const responses: string[] = [];

    const fetchFor = async (symbol: string, gen: number, delayMs: number) => {
      await new Promise((r) => setTimeout(r, delayMs));
      if (fence.isCurrent(gen)) responses.push(symbol);
    };

    const genA = fence.bump();
    void fetchFor("AAA", genA, 30);
    const genB = fence.bump();
    await fetchFor("BBB", genB, 5);

    expect(responses).toEqual(["BBB"]);
  });
});
