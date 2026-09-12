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
  it("never reports regular market open on weekends", () => {
    const satNoon = resolveMarketClock(et("2026-08-01T16:00:00Z")); // Sat 12:00 ET
    expect(satNoon.sessionId).toBe("closed");
    expect(satNoon.label).toBe("MARKET CLOSED");

    const sunNoon = resolveMarketClock(et("2026-08-02T16:00:00Z")); // Sun 12:00 ET
    expect(sunNoon.sessionId).toBe("closed");
    expect(sunNoon.label).toBe("MARKET CLOSED");
  });

  it("Saturday Sep 12 2026 1:00 PM ET (17:00Z) is closed with next session Mon Sep 14", () => {
    const s = resolveMarketClock(et("2026-09-12T17:00:00Z"));
    expect(s.sessionId).toBe("closed");
    expect(s.isTradingDay).toBe(false);
    expect(s.dot).toBe("gray");
    expect(s.label).not.toContain("MARKET OPEN");
    expect(s.label).not.toContain("PRE-MARKET");
    expect(s.label).not.toContain("AFTER-HOURS");
    expect(s.subLabel).toContain("Mon, Sep 14");
    expect(s.subLabel).toContain("4:00 AM ET");
  });

  it("Sunday Sep 13 2026 1:00 PM ET (17:00Z) is closed with next session Mon Sep 14", () => {
    const s = resolveMarketClock(et("2026-09-13T17:00:00Z"));
    expect(s.sessionId).toBe("closed");
    expect(s.isTradingDay).toBe(false);
    expect(s.dot).toBe("gray");
    expect(s.label).not.toContain("MARKET OPEN");
    expect(s.subLabel).toContain("Mon, Sep 14");
    expect(s.subLabel).toContain("4:00 AM ET");
  });

  it("Monday Sep 14 2026 10:00 AM ET (14:00Z) is a regular trading session", () => {
    const s = resolveMarketClock(et("2026-09-14T14:00:00Z"));
    expect(s.sessionId).toBe("market");
    expect(s.isTradingDay).toBe(true);
    expect(s.dot).toBe("green");
    expect(s.subLabel).toBe("Market closes 4:00 PM ET");
    expect(s.countdown).toBe("06:00:00");
  });

  it("resolves deterministic Monday pre/regular/after-hours windows", () => {
    const pre = resolveMarketClock(et("2026-08-03T12:00:00Z")); // Mon 8:00 ET
    expect(pre.sessionId).toBe("pre-market");

    const regular = resolveMarketClock(et("2026-08-03T14:00:00Z")); // Mon 10:00 ET
    expect(regular.sessionId).toBe("market");

    const afterHours = resolveMarketClock(et("2026-08-03T21:00:00Z")); // Mon 5:00 ET
    expect(afterHours.sessionId).toBe("after-hours");
  });

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
    const s = resolveMarketClock(et("2026-08-08T01:30:00Z")); // Fri 21:30 ET
    expect(s.sessionId).toBe("closed");
    expect(s.subLabel).toContain("Mon, Aug 10");
  });

  it("formats ET time in 12-hour form", () => {
    expect(formatEt12h(getEtParts(et("2026-08-02T17:18:21Z")))).toBe("1:18:21 PM");
    expect(formatEt12h(getEtParts(et("2026-08-03T04:05:06Z")))).toBe("12:05:06 AM");
  });
});
