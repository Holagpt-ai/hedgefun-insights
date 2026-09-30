import { describe, expect, it } from "vitest";
import {
  computeNhlDistancePct,
  formatNhlDistanceLabel,
} from "@/lib/screeners/nhl-distance";

describe("NHL distance from verified baseline", () => {
  it("new high distance is positive percent above prior 52W high", () => {
    const pct = computeNhlDistancePct({
      range_event: "new_high",
      high_52w: 100,
      low_52w: 50,
      day_high: 105,
      day_low: 98,
    });
    expect(pct).toBe(5);
    expect(formatNhlDistanceLabel("new_high", pct)).toContain("above prior 52W high");
  });

  it("new low distance is negative percent below prior 52W low", () => {
    const pct = computeNhlDistancePct({
      range_event: "new_low",
      high_52w: 100,
      low_52w: 50,
      day_high: 52,
      day_low: 48,
    });
    expect(pct).toBe(-4);
    expect(formatNhlDistanceLabel("new_low", pct)).toContain("below prior 52W low");
  });

  it("both uses new-high distance semantics", () => {
    const pct = computeNhlDistancePct({
      range_event: "both",
      high_52w: 10,
      low_52w: 5,
      day_high: 10.5,
      day_low: 4.5,
    });
    expect(pct).toBe(5);
  });

  it("missing baseline returns null", () => {
    expect(
      computeNhlDistancePct({
        range_event: "new_high",
        high_52w: null,
        low_52w: 50,
        day_high: 10,
        day_low: 9,
      }),
    ).toBeNull();
  });

  it("zero denominator stays null", () => {
    expect(
      computeNhlDistancePct({
        range_event: "new_high",
        high_52w: 0,
        low_52w: 5,
        day_high: 10,
        day_low: 9,
      }),
    ).toBeNull();
  });
});
