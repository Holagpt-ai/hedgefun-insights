import { describe, expect, it } from "vitest";
import {
  normalizePriorSessionShareVolume,
  resolveCumulativeSessionVolume,
} from "../cumulative-session-volume";

describe("resolveCumulativeSessionVolume", () => {
  it("prefers provider av over partial geometry (VEEA-class defect)", () => {
    const r = resolveCumulativeSessionVolume({
      providerAccumulatedVolume: 74_712_634,
      metricsSessionVolume: 74_712_634,
      geometrySessionVolumeSum: 71_297,
      snapshotDayVolume: null,
    });
    expect(r.source).toBe("provider_accumulated");
    expect(r.volume).toBe(74_712_634);
  });

  it("uses geometry when metrics are only retained-bar partial and geometry is fuller", () => {
    const r = resolveCumulativeSessionVolume({
      providerAccumulatedVolume: null,
      metricsSessionVolume: 50_000,
      geometrySessionVolumeSum: 180_000,
      snapshotDayVolume: null,
    });
    expect(r.source).toBe("geometry");
    expect(r.volume).toBe(180_000);
  });

  it("uses metrics when geometry is absent and av is missing", () => {
    const r = resolveCumulativeSessionVolume({
      providerAccumulatedVolume: null,
      metricsSessionVolume: 120_000,
      geometrySessionVolumeSum: null,
      snapshotDayVolume: null,
    });
    expect(r.source).toBe("metrics");
    expect(r.volume).toBe(120_000);
  });

  it("falls back to snapshot day.v only when stream cumulative is unavailable", () => {
    const r = resolveCumulativeSessionVolume({
      providerAccumulatedVolume: null,
      metricsSessionVolume: 0,
      geometrySessionVolumeSum: null,
      snapshotDayVolume: 2_000_000,
    });
    expect(r.source).toBe("snapshot");
    expect(r.volume).toBe(2_000_000);
  });

  it("returns none when all inputs are missing or zero", () => {
    const r = resolveCumulativeSessionVolume({
      providerAccumulatedVolume: null,
      metricsSessionVolume: 0,
      geometrySessionVolumeSum: 0,
      snapshotDayVolume: null,
    });
    expect(r.source).toBe("none");
    expect(r.volume).toBe(0);
  });

  it("penny/breakouts paths use the same cumulative resolver — Five Pillars unchanged", () => {
    const pennyEligible = resolveCumulativeSessionVolume({
      providerAccumulatedVolume: 2_000_000,
      metricsSessionVolume: 2_000_000,
      geometrySessionVolumeSum: 40_000,
      snapshotDayVolume: null,
    });
    expect(pennyEligible.volume).toBe(2_000_000);
  });

  it("does not treat invalid provider av as authoritative", () => {
    const r = resolveCumulativeSessionVolume({
      providerAccumulatedVolume: Number.NaN,
      metricsSessionVolume: 10_000,
      geometrySessionVolumeSum: 5_000,
      snapshotDayVolume: null,
    });
    expect(r.source).toBe("metrics");
    expect(r.volume).toBe(10_000);
  });
});

describe("normalizePriorSessionShareVolume", () => {
  it("rounds fractional provider prior volume to whole shares", () => {
    expect(normalizePriorSessionShareVolume(4_670_041.396848)).toBe(4_670_041);
  });

  it("returns null for missing or non-positive values", () => {
    expect(normalizePriorSessionShareVolume(null)).toBeNull();
    expect(normalizePriorSessionShareVolume(0)).toBeNull();
    expect(normalizePriorSessionShareVolume(-1)).toBeNull();
  });
});
