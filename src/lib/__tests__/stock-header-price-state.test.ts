import { describe, expect, it } from "vitest";
import {
  resolveStockHeaderPriceState,
  stockHeaderSessionContext,
} from "@/lib/price-utils";

describe("resolveStockHeaderPriceState", () => {
  it("premarket shows the extended price versus the prior official close", () => {
    const state = resolveStockHeaderPriceState({
      prevDay: { c: 1.68 },
      day: { c: 1.68 },
      lastTrade: { p: 2.94 },
      min: { c: 2.9 },
      todaysChange: 1.26,
      todaysChangePerc: 75,
    }, "pre-market");

    expect(state.displayedPrice).toBe(2.94);
    expect(state.referencePrice).toBe(1.68);
    expect(state.change).toBeCloseTo(1.26, 2);
    expect(state.changePercent).toBeCloseTo(75, 5);
    expect(state.basis).toBe("extended_vs_prior_close");
    expect(state.timestampSource).toBe("lastTrade");
    expect(stockHeaderSessionContext(state)).toBe("Pre-market · Previous close $1.68");
  });

  it("premarket with no extended print does not fabricate a percentage", () => {
    const state = resolveStockHeaderPriceState({
      prevDay: { c: 1.68 },
      todaysChange: 1.26,
      todaysChangePerc: 75,
    }, "pre-market");

    expect(state.displayedPrice).toBeNull();
    expect(state.referencePrice).toBe(1.68);
    expect(state.change).toBeNull();
    expect(state.changePercent).toBeNull();
    expect(state.basis).toBe("unavailable");
    expect(stockHeaderSessionContext(state)).toBe("Pre-market");
  });

  it("regular session keeps provider change on the resolved regular price", () => {
    const state = resolveStockHeaderPriceState({
      day: { c: 21 },
      prevDay: { c: 20 },
      lastTrade: { p: 21.4 },
      min: { c: 21.2 },
      todaysChange: 1,
      todaysChangePerc: 5,
    }, "market");

    expect(state.displayedPrice).toBe(21);
    expect(state.referencePrice).toBe(20);
    expect(state.change).toBe(1);
    expect(state.changePercent).toBe(5);
    expect(state.basis).toBe("regular_vs_prior_close");
    expect(state.timestampSource).toBe("day");
    expect(stockHeaderSessionContext(state)).toBeNull();
  });

  it("after hours uses the extended price versus that day's regular close", () => {
    const state = resolveStockHeaderPriceState({
      day: { c: 10 },
      prevDay: { c: 9 },
      lastTrade: { p: 11 },
      todaysChange: 2,
      todaysChangePerc: 22.22,
    }, "after-hours");

    expect(state.displayedPrice).toBe(11);
    expect(state.referencePrice).toBe(10);
    expect(state.change).toBe(1);
    expect(state.changePercent).toBeCloseTo(10, 5);
    expect(state.basis).toBe("extended_vs_regular_close");
    expect(stockHeaderSessionContext(state)).toBe("After-hours · Regular close $10.00");
  });

  it("does not calculate a percentage when the reference close is invalid", () => {
    const state = resolveStockHeaderPriceState({
      prevDay: { c: 0 },
      lastTrade: { p: 2.94 },
      todaysChangePerc: 75,
    }, "pre-market");

    expect(state.displayedPrice).toBe(2.94);
    expect(state.referencePrice).toBeNull();
    expect(state.change).toBeNull();
    expect(state.changePercent).toBeNull();
  });

  it("closed session keeps the official regular close and provider change", () => {
    const state = resolveStockHeaderPriceState({
      day: { c: 21 },
      prevDay: { c: 20 },
      lastTrade: { p: 22 },
      todaysChange: 1,
      todaysChangePerc: 5,
    }, "closed");

    expect(state.displayedPrice).toBe(21);
    expect(state.change).toBe(1);
    expect(state.changePercent).toBe(5);
    expect(state.basis).toBe("official_close");
    expect(state.timestampSource).toBe("day");
  });
});
