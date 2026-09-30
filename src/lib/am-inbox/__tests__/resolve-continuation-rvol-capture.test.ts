import { describe, expect, it } from "vitest";
import { resolveContinuationRvolCapture } from "@/lib/am-inbox/resolve-continuation-rvol-capture";

describe("resolveContinuationRvolCapture", () => {
  it("prefers rvol_20d tuple when ratio and avg_volume_20d both exist", () => {
    const capture = resolveContinuationRvolCapture({
      rvol_20d: 6,
      avg_volume_20d: 500_000,
      time_adjusted_rvol: 12,
      rvol_5m: 9,
      participation_baseline_session_count: 10,
    });
    expect(capture).toEqual({
      rawRvol: 6,
      metricKind: "rvol_20d",
      baselineVolume: 500_000,
      baselineSampleSize: null,
    });
  });

  it("returns rvol_20d-only tuple", () => {
    expect(
      resolveContinuationRvolCapture({
        rvol_20d: 4.2,
        avg_volume_20d: 200_000,
      }),
    ).toMatchObject({
      rawRvol: 4.2,
      metricKind: "rvol_20d",
      baselineVolume: 200_000,
    });
  });

  it("time_adjusted only keeps baseline volume null", () => {
    expect(
      resolveContinuationRvolCapture({
        time_adjusted_rvol: 7,
        avg_volume_20d: 900_000,
        participation_baseline_session_count: 8,
      }),
    ).toEqual({
      rawRvol: 7,
      metricKind: "time_adjusted",
      baselineVolume: null,
      baselineSampleSize: 8,
    });
  });

  it("rvol_5m only keeps baseline volume null", () => {
    expect(
      resolveContinuationRvolCapture({
        rvol_5m: 5.5,
        avg_volume_20d: 900_000,
        participation_baseline_session_count: 6,
      }),
    ).toEqual({
      rawRvol: 5.5,
      metricKind: "rvol_5m",
      baselineVolume: null,
      baselineSampleSize: 6,
    });
  });

  it("returns all null when no RVOL source is available", () => {
    expect(resolveContinuationRvolCapture({})).toEqual({
      rawRvol: null,
      metricKind: null,
      baselineVolume: null,
      baselineSampleSize: null,
    });
  });

  it("skips rvol_20d when avg_volume_20d baseline is missing", () => {
    expect(
      resolveContinuationRvolCapture({
        rvol_20d: 6,
        time_adjusted_rvol: 3,
      }),
    ).toMatchObject({
      rawRvol: 3,
      metricKind: "time_adjusted",
      baselineVolume: null,
    });
  });
});
