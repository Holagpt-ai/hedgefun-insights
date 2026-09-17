import { describe, expect, it } from "vitest";
import {
  canonicalPriorRatioFromDonor,
  hasCanonicalPriorDayVolume,
  isVerifiedRegularSessionChange,
  pricesWithinCanonicalTolerance,
} from "@/lib/screeners/canonical-fields";

describe("canonical foundational fields", () => {
  it("accepts verified regular-session change_percent only", () => {
    expect(isVerifiedRegularSessionChange(12.4)).toBe(true);
    expect(isVerifiedRegularSessionChange(null)).toBe(false);
    expect(isVerifiedRegularSessionChange(Number.NaN)).toBe(false);
  });

  it("recomputes prior ratio from sentinel volume without fabricating prior volume", () => {
    const pair = canonicalPriorRatioFromDonor(7_000_000, 1_000_000, 6.5, 6_500_000);
    expect(pair).toEqual({
      prior_session_volume: 1_000_000,
      volume_ratio_prior_session: 7,
    });
  });

  it("rejects inconsistent donor prior/ratio pairs", () => {
    expect(
      canonicalPriorRatioFromDonor(10_000_000, 1_000_000, 99, 10_000_000),
    ).toBeNull();
  });

  it("does not treat short-window move fields as canonical session change", () => {
    expect(isVerifiedRegularSessionChange(undefined)).toBe(false);
  });

  it("validates prior-day volume only when ratio is consistent", () => {
    expect(hasCanonicalPriorDayVolume(1_000_000, 5, 5_000_000)).toBe(true);
    expect(hasCanonicalPriorDayVolume(1_000_000, 99, 5_000_000)).toBe(false);
  });

  it("allows small price divergence between aligned snapshots", () => {
    expect(pricesWithinCanonicalTolerance(10.04, 10)).toBe(true);
    expect(pricesWithinCanonicalTolerance(10.2, 10)).toBe(false);
  });
});
