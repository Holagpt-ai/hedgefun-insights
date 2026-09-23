import { describe, expect, it } from "vitest";
import {
  formatScreenerRvol5m,
  formatScreenerVolumeAccelerationPct,
  formatScreenerVolumeVelocity,
} from "@/lib/screeners/screener-metric-display";

describe("screener momentum display", () => {
  it("formats 5m RVOL with honest nulls", () => {
    expect(formatScreenerRvol5m(null)).toBe("—");
    expect(formatScreenerRvol5m(5.44)).toBe("5.4×");
  });

  it("formats volume velocity", () => {
    expect(formatScreenerVolumeVelocity(null)).toBe("—");
    expect(formatScreenerVolumeVelocity(182_000)).toBe("182K/min");
    expect(formatScreenerVolumeVelocity(1_400_000)).toBe("1.4M/min");
  });

  it("formats volume acceleration percent", () => {
    expect(formatScreenerVolumeAccelerationPct(null)).toBe("—");
    expect(formatScreenerVolumeAccelerationPct(74.2)).toBe("+74%");
    expect(formatScreenerVolumeAccelerationPct(-31.4)).toBe("-31%");
    expect(formatScreenerVolumeAccelerationPct(0)).toBe("0%");
  });
});
