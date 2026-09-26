import { describe, expect, it } from "vitest";
import {
  classifyClosingRejection,
  computeAfterHoursExtensionPct,
  computeClosingRejectionPct,
} from "@/lib/screeners/continuation-derived-metrics";

describe("continuation derived metrics", () => {
  it("closing rejection uses HOD distance", () => {
    expect(computeClosingRejectionPct(100, 97)).toBeCloseTo(3);
    expect(classifyClosingRejection(3)).toBe("UNKNOWN");
    expect(classifyClosingRejection(2.9)).toBe("FALSE");
    expect(classifyClosingRejection(8)).toBe("TRUE");
  });

  it("AH extension preserves negative values", () => {
    expect(computeAfterHoursExtensionPct(10, 9.5)).toBeCloseTo(-5);
    expect(computeAfterHoursExtensionPct(null, 10)).toBeNull();
  });
});
