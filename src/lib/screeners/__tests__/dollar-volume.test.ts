import { describe, expect, it } from "vitest";
import { computeDollarVolume, formatDollarVolume } from "@/lib/screeners/dollar-volume";

describe("Dollar Volume", () => {
  it("computes $0.25 × 100M as $25M", () => {
    expect(computeDollarVolume(0.25, 100_000_000)).toBe(25_000_000);
    expect(formatDollarVolume(25_000_000)).toBe("$25.0M");
  });

  it("computes $12 × 10M as $120M", () => {
    expect(computeDollarVolume(12, 10_000_000)).toBe(120_000_000);
    expect(formatDollarVolume(120_000_000)).toBe("$120.0M");
  });

  it("returns unavailable for zero or invalid price", () => {
    expect(computeDollarVolume(0, 1_000_000)).toBe(null);
    expect(computeDollarVolume(-1, 1_000_000)).toBe(null);
    expect(computeDollarVolume(null, 1_000_000)).toBe(null);
    expect(formatDollarVolume(null)).toBe("Unavailable");
  });

  it("returns unavailable for invalid volume", () => {
    expect(computeDollarVolume(10, -1)).toBe(null);
    expect(computeDollarVolume(10, Number.NaN)).toBe(null);
  });

  it("keeps large values numerically safe", () => {
    const value = computeDollarVolume(500, 50_000_000);
    expect(value).toBe(25_000_000_000);
    expect(Number.isFinite(value)).toBe(true);
    expect(formatDollarVolume(value)).toBe("$25.0B");
  });
});
