import { describe, expect, it } from "vitest";
import { assessGapTrust } from "@/lib/screeners/screener-metric-trust";

describe("extreme gap trust", () => {
  it("ordinary gap has no warning", () => {
    expect(
      assessGapTrust({ gapPercent: 12, price: 11.2, previousClose: 10 }),
    ).toEqual({ flag: null, possibleCorporateActionScale: false });
  });

  it("extreme gap returns EXTREME_GAP_REVIEW", () => {
    expect(
      assessGapTrust({ gapPercent: 120, price: 22, previousClose: 10 }),
    ).toMatchObject({ flag: "EXTREME_GAP_REVIEW" });
  });

  it("extreme near-integer ratio still gets review warning without split claim", () => {
    const result = assessGapTrust({ gapPercent: 100, price: 20, previousClose: 10 });
    expect(result.flag).toBe("EXTREME_GAP_REVIEW");
    expect(result.possibleCorporateActionScale).toBe(true);
  });

  it("missing values fail closed", () => {
    expect(
      assessGapTrust({ gapPercent: 200, price: null, previousClose: 10 }),
    ).toEqual({ flag: null, possibleCorporateActionScale: false });
  });
});
