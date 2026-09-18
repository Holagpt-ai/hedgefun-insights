import { describe, expect, it } from "vitest";
import { resolveRvol20dFromSources } from "@/lib/screeners/resolve-rvol20d";
import type { VolumeBaselineQuote } from "@/lib/screeners/volume-baseline";

const baseline = (symbol = "TSLA"): VolumeBaselineQuote => ({
  symbol,
  avg_volume_20d: 50_000_000,
  volume_sessions_used: 20,
  window_start_date: "2026-08-01",
  window_end_date: "2026-09-17",
});

describe("resolveRvol20dFromSources", () => {
  it("returns RVOL from persisted avg when snapshot rvol is absent", () => {
    expect(
      resolveRvol20dFromSources({
        volume: 100_000_000,
        symbol: "TSLA",
        persistedAvgVolume20d: 50_000_000,
        tradingDate: "2026-09-18",
      }),
    ).toBe(2);
  });

  it("returns null when no baseline and no persisted fields", () => {
    expect(
      resolveRvol20dFromSources({
        volume: 100_000,
        symbol: "NEWCO",
        baselines: new Map(),
        tradingDate: "2026-09-18",
      }),
    ).toBeNull();
  });
});
