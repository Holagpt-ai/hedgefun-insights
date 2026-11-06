import { describe, expect, it } from "vitest";
import {
  formatFloatMeasurementAsOfLabel,
  formatScreenerVerifiedFreeFloat,
} from "@/lib/market-data/screener-free-float-display";

describe("screener free float display", () => {
  it("shows shares with honest provider measurement date", () => {
    expect(
      formatScreenerVerifiedFreeFloat(3_700_000, { measurementAsOf: "2026-09-23" }),
    ).toBe("3.7M (as of Sep 23, 2026)");
    expect(formatFloatMeasurementAsOfLabel("2026-09-23")).toBe("Sep 23, 2026");
  });

  it("does not imply today when only shares are known without measurement date", () => {
    expect(formatScreenerVerifiedFreeFloat(3_700_000)).toBe("3.7M");
    expect(formatScreenerVerifiedFreeFloat(null)).toBe("Unavailable");
  });
});
