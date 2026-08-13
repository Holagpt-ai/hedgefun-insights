import { describe, expect, it } from "vitest";
import {
  AFTER_HOURS_TIE_BREAK,
  extendedLast,
  isAfterHoursTimestamp,
  providerTimestampMs,
  selectNewestAfterHoursCandidate,
  type SnapshotTicker,
} from "@/lib/market-session";

/** Wed Aug 12, 2026 — EDT (UTC-4). */
const SUMMER_REF_MS = Date.parse("2026-08-12T22:45:00.000Z"); // 6:45 PM EDT
/** Exactly 16:00:00.000 EDT = 20:00:00.000Z */
const SUMMER_EXACT_CLOSE_MS = Date.parse("2026-08-12T20:00:00.000Z");
const SUMMER_JUST_AFTER_CLOSE_MS = Date.parse("2026-08-12T20:00:00.001Z");
/** Exactly 20:00:00.000 EDT = 00:00:00.000Z next calendar UTC day */
const SUMMER_EXACT_AH_END_MS = Date.parse("2026-08-13T00:00:00.000Z");
const SUMMER_AFTER_AH_END_MS = Date.parse("2026-08-13T00:00:00.001Z");

/** Thu Jan 15, 2026 — EST (UTC-5). */
const WINTER_REF_MS = Date.parse("2026-01-15T22:45:00.000Z"); // 5:45 PM EST
const WINTER_EXACT_CLOSE_MS = Date.parse("2026-01-15T21:00:00.000Z"); // 4:00 PM EST
const WINTER_JUST_AFTER_CLOSE_MS = Date.parse("2026-01-15T21:00:00.001Z");

describe("providerTimestampMs unit normalization", () => {
  const sampleMs = Date.parse("2026-08-12T20:00:01.000Z");

  it("normalizes Unix seconds", () => {
    expect(providerTimestampMs(Math.trunc(sampleMs / 1000))).toBe(sampleMs);
  });

  it("normalizes milliseconds", () => {
    expect(providerTimestampMs(sampleMs)).toBe(sampleMs);
  });

  it("normalizes microseconds", () => {
    expect(providerTimestampMs(sampleMs * 1_000)).toBe(sampleMs);
  });

  it("normalizes nanoseconds", () => {
    expect(providerTimestampMs(sampleMs * 1_000_000)).toBe(sampleMs);
  });

  it("rejects non-finite, zero, negative, and implausible magnitudes", () => {
    expect(providerTimestampMs(NaN)).toBeNull();
    expect(providerTimestampMs(Infinity)).toBeNull();
    expect(providerTimestampMs(0)).toBeNull();
    expect(providerTimestampMs(-1)).toBeNull();
    expect(providerTimestampMs(1e8)).toBeNull();
    expect(providerTimestampMs(5e10)).toBeNull();
    expect(providerTimestampMs(5e16)).toBeNull();
  });
});

describe("after-hours boundary (America/New_York)", () => {
  it("rejects exactly 4:00:00.000 p.m. ET in summer (EDT)", () => {
    expect(isAfterHoursTimestamp(SUMMER_EXACT_CLOSE_MS, SUMMER_REF_MS)).toBe(
      false,
    );
  });

  it("accepts immediately after 4:00 p.m. ET in summer (EDT)", () => {
    expect(
      isAfterHoursTimestamp(SUMMER_JUST_AFTER_CLOSE_MS, SUMMER_REF_MS),
    ).toBe(true);
  });

  it("accepts exactly 8:00:00.000 p.m. ET (inclusive endpoint)", () => {
    expect(isAfterHoursTimestamp(SUMMER_EXACT_AH_END_MS, SUMMER_REF_MS)).toBe(
      true,
    );
  });

  it("rejects after 8:00 p.m. ET", () => {
    expect(isAfterHoursTimestamp(SUMMER_AFTER_AH_END_MS, SUMMER_REF_MS)).toBe(
      false,
    );
  });

  it("rejects a different Eastern calendar date", () => {
    const priorDayAh = Date.parse("2026-08-11T22:00:00.000Z");
    expect(isAfterHoursTimestamp(priorDayAh, SUMMER_REF_MS)).toBe(false);
  });

  it("resolves winter EST close boundary correctly", () => {
    expect(isAfterHoursTimestamp(WINTER_EXACT_CLOSE_MS, WINTER_REF_MS)).toBe(
      false,
    );
    expect(
      isAfterHoursTimestamp(WINTER_JUST_AFTER_CLOSE_MS, WINTER_REF_MS),
    ).toBe(true);
  });
});

describe("newest after-hours observation selection", () => {
  const base: SnapshotTicker = {
    ticker: "TEST",
    day: { c: 10, v: 1_000_000 },
    prevDay: { c: 9, v: 100_000 },
  };

  it("newer AH minute beats older AH last trade", () => {
    const olderTrade = Date.parse("2026-08-12T20:05:00.000Z");
    const newerMin = Date.parse("2026-08-12T22:00:00.000Z");
    const t: SnapshotTicker = {
      ...base,
      lastTrade: { p: 11.1, t: olderTrade },
      min: { c: 10.5, t: newerMin },
    };
    const won = selectNewestAfterHoursCandidate(t, SUMMER_REF_MS);
    expect(won?.source).toBe("min");
    expect(won?.price).toBe(10.5);
    expect(extendedLast(t, SUMMER_REF_MS)).toBe(10.5);
  });

  it("newer AH last trade beats older AH minute", () => {
    const olderMin = Date.parse("2026-08-12T20:05:00.000Z");
    const newerTrade = Date.parse("2026-08-12T22:00:00.000Z");
    const t: SnapshotTicker = {
      ...base,
      lastTrade: { p: 11.1, t: newerTrade },
      min: { c: 10.5, t: olderMin },
    };
    const won = selectNewestAfterHoursCandidate(t, SUMMER_REF_MS);
    expect(won?.source).toBe("lastTrade");
    expect(won?.price).toBe(11.1);
    expect(extendedLast(t, SUMMER_REF_MS)).toBe(11.1);
  });

  it("equal timestamps use documented lastTrade preference", () => {
    expect(AFTER_HOURS_TIE_BREAK).toBe("lastTrade");
    const same = Date.parse("2026-08-12T21:00:00.000Z");
    const t: SnapshotTicker = {
      ...base,
      lastTrade: { p: 11.1, t: same },
      min: { c: 10.5, t: same },
    };
    const won = selectNewestAfterHoursCandidate(t, SUMMER_REF_MS);
    expect(won?.source).toBe("lastTrade");
    expect(won?.price).toBe(11.1);
  });

  it("regular-session last trade plus newer AH minute selects the minute", () => {
    const rthTrade = Date.parse("2026-08-12T19:00:00.000Z");
    const ahMin = Date.parse("2026-08-12T21:30:00.000Z");
    const t: SnapshotTicker = {
      ...base,
      lastTrade: { p: 9.9, t: rthTrade },
      min: { c: 10.4, t: ahMin },
    };
    expect(extendedLast(t, SUMMER_REF_MS)).toBe(10.4);
  });

  it("rejects invalid prices and timestamps", () => {
    expect(
      extendedLast(
        {
          ...base,
          lastTrade: { p: 0, t: SUMMER_JUST_AFTER_CLOSE_MS },
          min: { c: -1, t: SUMMER_JUST_AFTER_CLOSE_MS },
        },
        SUMMER_REF_MS,
      ),
    ).toBeNull();
    expect(
      extendedLast(
        {
          ...base,
          lastTrade: { p: 11, t: undefined },
          min: { c: 10.5, t: NaN },
        },
        SUMMER_REF_MS,
      ),
    ).toBeNull();
  });

  it("never mixes one candidate price with another candidate timestamp", () => {
    const olderTrade = Date.parse("2026-08-12T20:05:00.000Z");
    const newerMin = Date.parse("2026-08-12T22:00:00.000Z");
    const t: SnapshotTicker = {
      ...base,
      lastTrade: { p: 99.99, t: olderTrade },
      min: { c: 10.5, t: newerMin },
    };
    const won = selectNewestAfterHoursCandidate(t, SUMMER_REF_MS)!;
    expect(won.price).toBe(10.5);
    expect(won.ms).toBe(newerMin);
    expect(won.price).not.toBe(99.99);
  });
});
