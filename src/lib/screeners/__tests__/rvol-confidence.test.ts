import { describe, expect, it } from "vitest";
import { assessRvolConfidence, rankingRvolFromRaw } from "@/lib/screeners/rvol-confidence";

describe("rvol confidence", () => {
  it("preserves raw rvol on healthy baseline", () => {
    const result = assessRvolConfidence({
      rawRvol: 8,
      baselineVolume: 50_000,
      baselineSampleSize: 12,
      metricKind: "time_adjusted",
    });
    expect(result.rawRvol).toBe(8);
    expect(result.rvolConfidence).toBe("HIGH");
    expect(result.rankingRvol).toBeGreaterThanOrEqual(8);
  });

  it("dampens extreme rvol with thin baseline", () => {
    const result = assessRvolConfidence({
      rawRvol: 1200,
      baselineVolume: 12,
      baselineSampleSize: 12,
      metricKind: "rvol_5m",
    });
    expect(result.rawRvol).toBe(1200);
    expect(result.rvolConfidence).toBe("THIN_BASELINE");
    expect(result.rankingRvol).not.toBeNull();
    expect(result.rankingRvol!).toBeLessThan(1200);
  });

  it("flags insufficient history", () => {
    const result = assessRvolConfidence({
      rawRvol: 40,
      baselineSampleSize: 2,
    });
    expect(result.rvolConfidence).toBe("INSUFFICIENT_HISTORY");
    expect(rankingRvolFromRaw(40, "INSUFFICIENT_HISTORY")).toBeLessThan(40);
  });
});
