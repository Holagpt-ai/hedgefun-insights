import { describe, expect, it } from "vitest";
import { computeFloatTurnover, formatFloatTurnover } from "@/features/day-trade-radar-v2/float-turnover";

describe("float turnover", () => {
  it("divides today volume by verified float", () => {
    expect(computeFloatTurnover(3_700_000, 2_400_000)).toBe(1.54);
    expect(formatFloatTurnover(1.54)).toBe("1.54×");
  });

  it("never calculates on missing or non-positive float", () => {
    expect(computeFloatTurnover(3_700_000, null)).toBeNull();
    expect(computeFloatTurnover(3_700_000, 0)).toBeNull();
    expect(computeFloatTurnover(null, 2_400_000)).toBeNull();
    expect(formatFloatTurnover(null)).toBe("Unavailable");
  });
});
