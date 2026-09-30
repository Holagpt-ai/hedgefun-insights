import { describe, expect, it } from "vitest";
import {
  gapPercentFromVerifiedInputs,
  verifiedGapPercentFromRadarCandidate,
} from "@/lib/screeners/normalized-market-snapshot";

describe("normalized market snapshot", () => {
  it("computes positive gap at threshold", () => {
    expect(gapPercentFromVerifiedInputs(10.5, 10)).toBe(5);
  });

  it("computes negative gap", () => {
    expect(gapPercentFromVerifiedInputs(9.5, 10)).toBe(-5);
  });

  it("returns null when previous close missing", () => {
    expect(gapPercentFromVerifiedInputs(10, null)).toBeNull();
  });

  it("derives radar gap from persisted previous close", () => {
    expect(
      verifiedGapPercentFromRadarCandidate({
        symbol: "ZZ",
        last_price: 3,
        previous_close: 2,
      } as Parameters<typeof verifiedGapPercentFromRadarCandidate>[0]),
    ).toBe(50);
  });
});
