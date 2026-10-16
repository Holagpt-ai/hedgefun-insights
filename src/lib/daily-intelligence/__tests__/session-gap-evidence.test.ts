import { describe, expect, it } from "vitest";
import { resolveSessionGapPercent, sessionGapEligible } from "@/lib/daily-intelligence/session-gap-evidence";

describe("session gap evidence", () => {
  it("prefers gap_percent over change_percent for display", () => {
    expect(resolveSessionGapPercent({ gap_percent: 6, change_percent: 2 })).toBe(6);
  });

  it("falls back to change_percent when gap_percent is missing", () => {
    expect(resolveSessionGapPercent({ gap_percent: null, change_percent: 7.2 })).toBe(7.2);
  });

  it("requires minimum absolute gap for eligibility", () => {
    expect(sessionGapEligible({ change_percent: 4.9 }, 5)).toBe(false);
    expect(sessionGapEligible({ change_percent: 5 }, 5)).toBe(true);
  });
});
