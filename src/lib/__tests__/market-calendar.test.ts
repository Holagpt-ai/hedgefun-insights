import { describe, expect, it } from "vitest";
import {
  formatEt12h,
  getEtParts,
  getRegularCloseMins,
  isTradingDay,
  nextTradingDay,
  resolveMarketClock,
} from "@/lib/market-calendar";

// ET = UTC-4 in summer (EDT), UTC-5 in winter (EST).
const et = (iso: string) => new Date(iso);

describe("market calendar", () => {
  it("Sunday Aug 2 2026 1:18 PM ET is closed, next session Monday Aug 3", () => {
    const s = resolveMarketClock(et("2026-08-02T17:18:21Z"));
    expect(s.sessionId).toBe("closed");
    expect(s.dot).toBe("gray");
    expect(s.label).not.toContain("MARKET OPEN");
    expect(s.isTradingDay).toBe(false);
    expect(s.subLabel).toContain("Mon, Aug 3");
    expect(s.etTimeStr).toBe("1:18:21 PM");
    // 1:18:21 PM Sun -> 4:00 AM Mon = 14h 41m 39s
    expect(s.countdown).toBe("14:41:39");
  });

  it("Monday Aug 3 2026 10:00 AM ET is regular market with 4:00 PM close", () => {
    const s = resolveMarketClock(et("2026-08-03T14:00:00Z"));
    expect(s.sessionId).toBe("market");
    expect(s.dot).toBe("green");
    expect(s.subLabel).toBe("Market closes 4:00 PM ET");
    expect(s.countdown).toBe("06:00:00");
  });

  it("Labor Day Sep 7 2026 is a holiday, next trading day Sep 8", () => {
    const s = resolveMarketClock(et("2026-09-07T14:00:00Z"));
    expect(s.sessionId).toBe("closed");
    expect(s.subLabel).toContain("Tue, Sep 8");
    expect(isTradingDay("2026-09-07", 1)).toBe(false);
    expect(nextTradingDay("2026-09-07").date).toBe("2026-09-08");
  });

  it("Friday Nov 27 2026 is an early close at 1:00 PM ET", () => {
    expect(getRegularCloseMins("2026-11-27")).toBe(780);
    const s = resolveMarketClock(et("2026-11-27T15:00:00Z")); // 10:00 ET (EST)
    expect(s.sessionId).toBe("market");
    expect(s.subLabel).toContain("1:00 PM ET");
    expect(s.subLabel).not.toContain("4:00 PM");
    expect(s.countdown).toBe("03:00:00");
    // after 1:00 PM ET the after-hours session is active
    const s2 = resolveMarketClock(et("2026-11-27T18:30:00Z")); // 13:30 ET
    expect(s2.sessionId).toBe("after-hours");
  });

  it("Friday evening rolls to the next trading day, not tomorrow", () => {
    const s = resolveMarketClock(et("2026-08-07T23:30:00Z")); // Fri 19:30 ET
    expect(s.sessionId).toBe("closed");
    expect(s.subLabel).toContain("Mon, Aug 10");
  });

  it("formats ET time in 12-hour form", () => {
    expect(formatEt12h(getEtParts(et("2026-08-02T17:18:21Z")))).toBe("1:18:21 PM");
    expect(formatEt12h(getEtParts(et("2026-08-03T04:05:06Z")))).toBe("12:05:06 AM");
  });
});
