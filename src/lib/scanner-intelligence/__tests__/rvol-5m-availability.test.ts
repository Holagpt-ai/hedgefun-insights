import { describe, expect, it } from "vitest";
import { assessRvol5mAvailability } from "@/lib/scanner-intelligence/rvol-5m-availability";
import { computeRvol5mFromBaseline } from "@/lib/scanner-intelligence/rvol-5m-intelligence";
import { formatScreenerRvol5m } from "@/lib/screeners/screener-metric-display";

describe("5-minute RVOL availability", () => {
  it("keeps a valid zero distinct from missing", () => {
    expect(assessRvol5mAvailability({ rvol5m: 0, sessionKind: "market" })).toEqual({
      kind: "valid_zero",
    });
    expect(formatScreenerRvol5m(0)).toBe("0.0×");
    expect(formatScreenerRvol5m(null)).toBe("—");
  });

  it("does not treat pre-market or after-hours as a missing baseline", () => {
    expect(assessRvol5mAvailability({ rvol5m: null, sessionKind: "pre-market" })).toEqual({
      kind: "unavailable",
      reason: "not_regular_session",
    });
    expect(assessRvol5mAvailability({ rvol5m: null, sessionKind: "after-hours" })).toEqual({
      kind: "unavailable",
      reason: "not_regular_session",
    });
  });

  it("reports a missing TOD baseline when the 5-minute window exists in RTH", () => {
    expect(
      assessRvol5mAvailability({
        rvol5m: null,
        sessionKind: "market",
        current5mVolume: 120_000,
      }),
    ).toEqual({ kind: "unavailable", reason: "missing_baseline" });
  });

  it("never substitutes daily RVOL or VOL/YDAY into the 5-minute value", () => {
    expect(computeRvol5mFromBaseline(100_000, { expectedVolume: 50_000, sampleCount: 4 })).toBeNull();
    expect(computeRvol5mFromBaseline(100_000, { expectedVolume: 50_000, sampleCount: 5 })).toBe(2);
    expect(computeRvol5mFromBaseline(0, { expectedVolume: 50_000, sampleCount: 5 })).toBe(0);
  });

  it("marks stale observations unavailable", () => {
    expect(assessRvol5mAvailability({ rvol5m: 3.2, stale: true })).toEqual({
      kind: "unavailable",
      reason: "stale",
    });
  });
});
