import { describe, expect, it } from "vitest";
import { classifyIntradaySegment } from "@/lib/intraday-reconstruction/normalize-minute-bars";
import { computePostMomentumForwardOutcomes } from "@/lib/intraday-reconstruction/compute-post-momentum-forward-outcomes";
import type { NormalizedIntradayBar } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";

function etMs(isoDate: string, hour: number, minute: number): number {
  return new Date(
    `${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`,
  ).getTime();
}

function regBar(
  isoDate: string,
  minuteOffset: number,
  close: number,
  high = close + 0.05,
  low = close - 0.05,
): NormalizedIntradayBar {
  const tsMs = etMs(isoDate, 9, 30) + minuteOffset * 60_000;
  return {
    tsMs,
    open: close,
    high,
    low,
    close,
    volume: 1000,
    segment: classifyIntradaySegment(tsMs),
  };
}

describe("post-momentum forward outcomes", () => {
  it("does not use bars at or before the reference timestamp", () => {
    const sessionDate = "2024-06-03";
    const referenceMs = etMs(sessionDate, 10, 0);
    const bars = [
      regBar(sessionDate, 0, 10),
      regBar(sessionDate, 30, 10.5, 10.6, 10.4),
      regBar(sessionDate, 31, 10.8, 10.9, 10.7),
      regBar(sessionDate, 36, 11, 11.2, 10.9),
    ];
    const sessionCloseMs = bars[bars.length - 1]!.tsMs;
    const outcomes = computePostMomentumForwardOutcomes({
      direction: "POSITIVE",
      referenceTimestampMs: referenceMs,
      referencePrice: 10,
      referenceHigh: 10.2,
      bars,
      sessionCloseMs,
    });
    const m5 = outcomes[5];
    expect(m5?.availabilityState).toBe("AVAILABLE");
    expect(m5?.maxFavorablePct).toBeGreaterThan(0);
    expect(m5?.endReturnPct).not.toBeNull();
  });

  it("marks partial window when session ends before horizon", () => {
    const sessionDate = "2024-06-03";
    const referenceMs = etMs(sessionDate, 9, 35);
    const bars = [regBar(sessionDate, 5, 10.2), regBar(sessionDate, 10, 10.3)];
    const outcomes = computePostMomentumForwardOutcomes({
      direction: "POSITIVE",
      referenceTimestampMs: referenceMs,
      referencePrice: 10,
      referenceHigh: 10,
      bars,
      sessionCloseMs: bars[bars.length - 1]!.tsMs,
    });
    expect(outcomes[60]?.availabilityState).toBe("PARTIAL_WINDOW");
    expect(outcomes["SESSION_CLOSE"]?.availabilityState).toBe("AVAILABLE");
  });

  it("returns invalid reference when momentum timestamp missing", () => {
    const outcomes = computePostMomentumForwardOutcomes({
      direction: "POSITIVE",
      referenceTimestampMs: null,
      referencePrice: 10,
      referenceHigh: 10,
      bars: [],
      sessionCloseMs: null,
    });
    expect(outcomes[5]?.availabilityState).toBe("INVALID_REFERENCE");
  });
});
