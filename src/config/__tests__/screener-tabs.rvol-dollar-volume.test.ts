import { describe, expect, it } from "vitest";
import {
  SCREENER_TABS,
  withScreenerLiquidityColumns,
  type ScreenerColumn,
} from "@/config/screener-tabs.config";

describe("screener tab liquidity columns", () => {
  it("enables $ Volume and RVOL 20D after Volume on every managed tab", () => {
    for (const tab of SCREENER_TABS) {
      const keys = tab.columns.map((column) => column.key);
      const volumeIdx = keys.indexOf("volume");
      expect(volumeIdx).toBeGreaterThanOrEqual(0);
      expect(keys[volumeIdx + 1]).toBe("dollar_volume");
      expect(keys[volumeIdx + 2]).toBe("rvol_20d");
      expect(tab.columns[volumeIdx].label === "Volume" || tab.columns[volumeIdx].label === "Day Vol").toBe(
        true,
      );
      expect(tab.columns[volumeIdx + 1].label).toBe("$ Volume");
      expect(tab.columns[volumeIdx + 2].label).toBe("RVOL 20D");
    }
  });

  it("does not rename Volume or replace Vol/Prior", () => {
    const volumeSpikes = SCREENER_TABS.find((tab) => tab.id === "volume_spikes");
    expect(volumeSpikes).toBeTruthy();
    const keys = volumeSpikes!.columns.map((column) => column.key);
    expect(keys).toContain("volume");
    expect(keys).toContain("volume_ratio_prior_session");
    expect(keys.indexOf("dollar_volume")).toBeLessThan(keys.indexOf("volume_ratio_prior_session"));
    expect(keys.indexOf("rvol_20d")).toBeLessThan(keys.indexOf("volume_ratio_prior_session"));
  });

  it("inserts liquidity columns through one helper rather than per-tab copies", () => {
    const base: ScreenerColumn[] = [
      { key: "symbol", label: "Symbol", format: "text" },
      { key: "volume", label: "Volume", format: "volume" },
      { key: "catalyst_news", label: "Catalyst", format: "text" },
    ];
    expect(withScreenerLiquidityColumns(base).map((column) => column.key)).toEqual([
      "symbol",
      "volume",
      "dollar_volume",
      "rvol_20d",
      "catalyst_news",
    ]);
  });
});
