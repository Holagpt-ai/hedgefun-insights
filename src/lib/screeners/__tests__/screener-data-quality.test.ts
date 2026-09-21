import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeDollarVolume } from "@/lib/screeners/dollar-volume";
import {
  formatScreenerDollarVolume,
  formatScreenerRvol20d,
} from "@/lib/screeners/screener-metric-display";
import {
  displayScreenerMetricValue,
  toScreenerDollarVolumeValue,
  toScreenerRvol20dValue,
} from "@/lib/screeners/screener-data-quality";
import { isUsableForDisplay, isUsableForFiltering, isUsableForScoring } from "@/lib/screeners/data-quality";
import { compareCandidatesVolumeFirst } from "@/lib/screeners/radar-v2-adapter";

describe("Screener Data Quality adapter — RVOL 20D", () => {
  it("1. valid finite RVOL preserves the exact persisted value", () => {
    const value = toScreenerRvol20dValue(3.84);
    expect(value.qualityState).toBe("AUTHORITATIVE");
    expect(value.provenance).toBe("INTERNAL");
    expect(value.source).toBe("screener_results.rvol_20d");
    expect(value.value).toBe(3.84);
    expect(value.metric).toBe("rvol20d");
  });

  it("2. NULL is UNAVAILABLE", () => {
    const value = toScreenerRvol20dValue(null);
    expect(value.qualityState).toBe("UNAVAILABLE");
    expect(value.value).toBeNull();
    expect(isUsableForDisplay(value)).toBe(false);
  });

  it("3. NaN and Infinity are INVALID", () => {
    expect(toScreenerRvol20dValue(Number.NaN).qualityState).toBe("INVALID");
    expect(toScreenerRvol20dValue(Number.POSITIVE_INFINITY).qualityState).toBe("INVALID");
    expect(toScreenerRvol20dValue(Number.NEGATIVE_INFINITY).value).toBeNull();
  });

  it("4. unavailable RVOL still displays —", () => {
    expect(formatScreenerRvol20d(null)).toBe("—");
    expect(formatScreenerRvol20d(undefined)).toBe("—");
    expect(formatScreenerRvol20d(Number.NaN)).toBe("—");
    expect(formatScreenerRvol20d(Number.POSITIVE_INFINITY)).toBe("—");
    expect(displayScreenerMetricValue(toScreenerRvol20dValue(null), (n) => `${n}x`)).toBe("—");
  });

  it("5. valid zero remains valid zero", () => {
    const value = toScreenerRvol20dValue(0);
    expect(value.qualityState).toBe("AUTHORITATIVE");
    expect(value.value).toBe(0);
    expect(formatScreenerRvol20d(0)).toBe("0.0×");
  });

  it("does not recompute or substitute Vol/Prior", () => {
    const value = toScreenerRvol20dValue(null);
    expect(value.value).toBeNull();
    expect(formatScreenerRvol20d(null)).not.toBe("8.1×");
    expect(value.source).toBe("screener_results.rvol_20d");
  });
});

describe("Screener Data Quality adapter — Dollar Volume", () => {
  it("6. valid price + volume yields the correct DERIVED value", () => {
    const value = toScreenerDollarVolumeValue(12, 10_000_000);
    expect(value.qualityState).toBe("DERIVED");
    expect(value.provenance).toBe("DERIVED");
    expect(value.value).toBe(120_000_000);
    expect(value.value).toBe(computeDollarVolume(12, 10_000_000));
    expect(formatScreenerDollarVolume(12, 10_000_000)).toBe("$120.0M");
  });

  it("7. lineage identifies price and volume inputs", () => {
    const value = toScreenerDollarVolumeValue(10, 1_000_000);
    expect(value.lineage?.inputs).toEqual(["price", "volume"]);
  });

  it("8. missing price is unusable and displays —", () => {
    const value = toScreenerDollarVolumeValue(null, 1_000_000);
    expect(value.value).toBeNull();
    expect(["UNAVAILABLE", "PARTIAL"]).toContain(value.qualityState);
    expect(isUsableForScoring(value)).toBe(false);
    expect(isUsableForFiltering(value)).toBe(false);
    expect(formatScreenerDollarVolume(null, 1_000_000)).toBe("—");
  });

  it("9. missing volume is unusable and displays —", () => {
    const value = toScreenerDollarVolumeValue(10, null);
    expect(value.value).toBeNull();
    expect(["UNAVAILABLE", "PARTIAL"]).toContain(value.qualityState);
    expect(isUsableForScoring(value)).toBe(false);
    expect(isUsableForFiltering(value)).toBe(false);
    expect(formatScreenerDollarVolume(10, null)).toBe("—");
  });

  it("10. invalid input makes Dollar Volume invalid/unusable", () => {
    const value = toScreenerDollarVolumeValue(Number.NaN, 1_000_000);
    expect(value.qualityState).toBe("INVALID");
    expect(value.value).toBeNull();
    expect(isUsableForDisplay(value)).toBe(false);
    expect(formatScreenerDollarVolume(Number.NaN, 1_000_000)).toBe("—");
  });

  it("11. valid zero remains $0", () => {
    const value = toScreenerDollarVolumeValue(10, 0);
    expect(value.qualityState).toBe("DERIVED");
    expect(value.value).toBe(0);
    expect(formatScreenerDollarVolume(10, 0)).toBe("$0");
  });

  it("does not fabricate freshness as FRESH", () => {
    expect(toScreenerRvol20dValue(2).freshnessState).toBe("UNKNOWN");
    expect(toScreenerDollarVolumeValue(10, 1_000).freshnessState).toBe("UNKNOWN");
  });
});

describe("Screener Data Quality adapter — Discovery safety", () => {
  it("12. Discovery comparator remains volume-first", () => {
    const high = {
      symbol: "AAA",
      session_volume: 5_000_000,
      volume_60s: 1,
      dollar_volume_60s: 1,
    };
    const low = {
      symbol: "BBB",
      session_volume: 1_000_000,
      volume_60s: 9,
      dollar_volume_60s: 9_000_000,
    };
    expect(compareCandidatesVolumeFirst(high as never, low as never)).toBeLessThan(0);
  });

  it("13. compareCandidatesVolumeFirst source is untouched", () => {
    const src = readFileSync(resolve("src/lib/screeners/radar-v2-adapter.ts"), "utf8");
    expect(src).toContain("export function compareCandidatesVolumeFirst(");
    expect(src).toContain("d = descKey(b.session_volume) - descKey(a.session_volume)");
  });

  it("14. no fake fallback for missing RVOL or Dollar Volume", () => {
    expect(formatScreenerRvol20d(null)).toBe("—");
    expect(formatScreenerDollarVolume(null, null)).toBe("—");
    expect(formatScreenerRvol20d(null)).not.toMatch(/sample/i);
    expect(formatScreenerDollarVolume(null, 8.1)).not.toBe("$8");
  });

  it("15. Phase 3 presentation tokens are unchanged", () => {
    expect(formatScreenerRvol20d(1.2)).toBe("1.2×");
    expect(formatScreenerRvol20d(3.8)).toBe("3.8×");
    expect(formatScreenerRvol20d(12.4)).toBe("12.4×");
    expect(formatScreenerDollarVolume(0.425, 1_000_000)).toBe("$425K");
    expect(formatScreenerDollarVolume(3.8, 1_000_000)).toBe("$3.8M");
    expect(formatScreenerDollarVolume(112.4, 1_000_000)).toBe("$112.4M");
    expect(formatScreenerDollarVolume(12, 100_000_000)).toBe("$1.2B");
  });
});
