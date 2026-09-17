import { describe, expect, it } from "vitest";
import {
  isVolumeBaselineValidForTradingDate,
  rvol20dFromBaseline,
  type VolumeBaselineQuote,
} from "@/lib/screeners/volume-baseline";

function baseline(overrides: Partial<VolumeBaselineQuote> = {}): VolumeBaselineQuote {
  return {
    symbol: "AAA",
    avg_volume_20d: 2_000_000,
    volume_sessions_used: 20,
    window_start_date: "2026-08-01",
    window_end_date: "2026-08-28",
    ...overrides,
  };
}

describe("volume baseline validity", () => {
  it("rejects self-inclusive baselines on the same trading date", () => {
    expect(isVolumeBaselineValidForTradingDate(baseline(), "2026-08-28")).toBe(false);
  });

  it("accepts baselines whose window ends before the trading date", () => {
    expect(isVolumeBaselineValidForTradingDate(baseline(), "2026-08-29")).toBe(true);
  });

  it("computes live RVOL from sentinel volume and donor avg only", () => {
    const result = rvol20dFromBaseline(10_000_000, baseline(), "2026-09-01");
    expect(result.avg_volume_20d).toBe(2_000_000);
    expect(result.rvol_20d).toBe(5);
  });

  it("returns unavailable when baseline is self-inclusive", () => {
    expect(rvol20dFromBaseline(10_000_000, baseline(), "2026-08-28")).toEqual({
      avg_volume_20d: null,
      rvol_20d: null,
    });
  });

  it("fail-closed when history window includes partial current trading day D", () => {
    const partialDayBaseline = baseline({
      window_start_date: "2026-09-02",
      window_end_date: "2026-09-17",
    });
    expect(isVolumeBaselineValidForTradingDate(partialDayBaseline, "2026-09-17")).toBe(false);
    expect(rvol20dFromBaseline(12_000_000, partialDayBaseline, "2026-09-17")).toEqual({
      avg_volume_20d: null,
      rvol_20d: null,
    });
  });
});
