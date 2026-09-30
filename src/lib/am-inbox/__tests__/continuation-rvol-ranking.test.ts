import { describe, expect, it } from "vitest";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { continuationRankingRvolFromContext } from "@/lib/am-inbox/continuation-rvol-ranking";
import { assessRvolConfidence, rankingRvolFromRaw } from "@/lib/screeners/rvol-confidence";

function ctx(
  overrides: {
    rvol?: number | null;
    rvolBaselineVolume?: number | null;
    rvolBaselineSampleSize?: number | null;
    volume?: number | null;
  } = {},
) {
  return buildLateSessionContinuationContext({
    symbol: "TEST",
    sourceSessionDate: "2026-09-21",
    sourceTimestamp: "2026-09-21T20:00:00.000Z",
    sourceCategory: "POWER_HOUR_MOMENTUM",
    volume: overrides.volume ?? 5_000_000,
    rvol: overrides.rvol ?? 10,
    rvolMetricKind: "rvol_20d",
    rvolBaselineVolume: overrides.rvolBaselineVolume,
    rvolBaselineSampleSize: overrides.rvolBaselineSampleSize,
  });
}

describe("continuation ranking RVOL from context", () => {
  it("uses robust baseline metadata for strong ranking contribution", () => {
    const ranking = continuationRankingRvolFromContext(
      ctx({ rvol: 12, rvolBaselineVolume: 500_000, rvolBaselineSampleSize: 12 }),
    );
    expect(ranking).toBeGreaterThan(10);
  });

  it("reduces thin-baseline extreme raw RVOL contribution", () => {
    const thin = continuationRankingRvolFromContext(
      ctx({ rvol: 1000, rvolBaselineVolume: 100, rvolBaselineSampleSize: 12 }),
    );
    const robust = continuationRankingRvolFromContext(
      ctx({ rvol: 1000, rvolBaselineVolume: 500_000, rvolBaselineSampleSize: 12 }),
    );
    expect(thin).toBeLessThan(robust);
  });

  it("uses conservative path when baseline metadata is unknown", () => {
    const unknown = continuationRankingRvolFromContext(ctx({ rvol: 1000 }));
    expect(unknown).toBeLessThan(1000);
    expect(unknown).toBe(rankingRvolFromRaw(1000, "INSUFFICIENT_HISTORY"));
  });

  it("never uses current session volume as RVOL baseline", () => {
    const withSessionVolumeOnly = continuationRankingRvolFromContext(
      ctx({ rvol: 1000, volume: 8_000_000, rvolBaselineVolume: null }),
    );
    const wronglyUsingSession = assessRvolConfidence({
      rawRvol: 1000,
      baselineVolume: 8_000_000,
      metricKind: "time_adjusted",
    }).rankingRvol!;
    expect(withSessionVolumeOnly).not.toBe(wronglyUsingSession);
  });
});
