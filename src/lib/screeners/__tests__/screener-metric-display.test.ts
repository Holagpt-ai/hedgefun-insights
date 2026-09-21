import { describe, expect, it } from "vitest";
import { computeDollarVolume } from "@/lib/screeners/dollar-volume";
import {
  SCREENER_UNAVAILABLE_DISPLAY,
  formatScreenerDollarVolume,
  formatScreenerDollarVolumeFromRow,
  formatScreenerRvol20d,
  resolveDisplayDollarVolume,
  resolveDisplayRvol20d,
} from "@/lib/screeners/screener-metric-display";

describe("screener metric display — RVOL 20D", () => {
  it("renders a valid RVOL with one decimal and a times suffix", () => {
    expect(formatScreenerRvol20d(1.2)).toBe("1.2×");
    expect(formatScreenerRvol20d(3.8)).toBe("3.8×");
    expect(formatScreenerRvol20d(12.4)).toBe("12.4×");
  });

  it("renders null or undefined RVOL as —", () => {
    expect(formatScreenerRvol20d(null)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(formatScreenerRvol20d(undefined)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(resolveDisplayRvol20d(null)).toBeNull();
  });

  it("renders non-finite RVOL as —", () => {
    expect(formatScreenerRvol20d(Number.NaN)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(formatScreenerRvol20d(Number.POSITIVE_INFINITY)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(formatScreenerRvol20d(Number.NEGATIVE_INFINITY)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(resolveDisplayRvol20d(Number.NaN)).toBeNull();
  });

  it("keeps a valid numeric zero", () => {
    expect(formatScreenerRvol20d(0)).toBe("0.0×");
    expect(resolveDisplayRvol20d(0)).toBe(0);
  });

  it("does not invent a fallback metric when RVOL is missing", () => {
    expect(formatScreenerRvol20d(null)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(formatScreenerRvol20d(null)).not.toBe("0.0×");
    expect(formatScreenerRvol20d(null)).not.toBe("0×");
  });
});

describe("screener metric display — Dollar Volume", () => {
  it("formats compact readable dollar volume", () => {
    expect(formatScreenerDollarVolume(425_000)).toBe("$425K");
    expect(formatScreenerDollarVolume(3_800_000)).toBe("$3.8M");
    expect(formatScreenerDollarVolume(112_400_000)).toBe("$112.4M");
    expect(formatScreenerDollarVolume(1_200_000_000)).toBe("$1.2B");
  });

  it("calculates dollar volume as price × volume", () => {
    expect(resolveDisplayDollarVolume(12, 10_000_000)).toBe(120_000_000);
    expect(formatScreenerDollarVolumeFromRow(12, 10_000_000)).toBe("$120.0M");
    expect(resolveDisplayDollarVolume(12, 10_000_000)).toBe(computeDollarVolume(12, 10_000_000));
  });

  it("renders missing price or volume as —", () => {
    expect(formatScreenerDollarVolumeFromRow(null, 1_000_000)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(formatScreenerDollarVolumeFromRow(10, null)).toBe(SCREENER_UNAVAILABLE_DISPLAY);
    expect(formatScreenerDollarVolumeFromRow(Number.NaN, 1_000_000)).toBe(
      SCREENER_UNAVAILABLE_DISPLAY,
    );
    expect(resolveDisplayDollarVolume(undefined, 1_000_000)).toBeNull();
  });

  it("keeps a valid numeric zero", () => {
    expect(resolveDisplayDollarVolume(10, 0)).toBe(0);
    expect(formatScreenerDollarVolume(0)).toBe("$0");
    expect(formatScreenerDollarVolumeFromRow(10, 0)).toBe("$0");
  });
});
