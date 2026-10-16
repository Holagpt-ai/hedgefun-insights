import { describe, expect, it } from "vitest";
import { resolveContinuationRvolCapture } from "@/lib/am-inbox/resolve-continuation-rvol-capture";

describe("resolveContinuationRvolCapture", () => {
  it("prefers time_adjusted over daily rvol when both are present", () => {
    const capture = resolveContinuationRvolCapture({
      rvol_20d: 6,
      avg_volume_20d: 500_000,
      time_adjusted_rvol: 3,
      volume: 3_000_000,
      rvol_5m: 9,
      participation_baseline_session_count: 10,
    });
    expect(capture).toEqual({
      rawRvol: 3,
      metricKind: "time_adjusted",
      baselineVolume: 1_000_000,
      baselineSampleSize: 10,
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

  it("time_adjusted derives implied baseline from session volume", () => {
    expect(
      resolveContinuationRvolCapture({
        time_adjusted_rvol: 3,
        volume: 3_000_000,
        participation_baseline_session_count: 12,
      }),
    ).toEqual({
      rawRvol: 3,
      metricKind: "time_adjusted",
      baselineVolume: 1_000_000,
      baselineSampleSize: 12,
    });
  });

  it("rvol_5m does not substitute session volume when volume_5m is missing", () => {
    expect(
      resolveContinuationRvolCapture({
        rvol_5m: 5.5,
        volume: 5_000_000,
        participation_baseline_session_count: 6,
      }),
    ).toMatchObject({
      rawRvol: 5.5,
      metricKind: "rvol_5m",
      baselineVolume: null,
      baselineSampleSize: 6,
    });
  });

  it("rvol_5m derives implied baseline from short-window volume", () => {
    expect(
      resolveContinuationRvolCapture({
        rvol_5m: 5.5,
        volume_5m: 550_000,
        participation_baseline_session_count: 6,
      }),
    ).toEqual({
      rawRvol: 5.5,
      metricKind: "rvol_5m",
      baselineVolume: 100_000,
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
      baselineSampleSize: null,
    });
  });
});
