import { describe, expect, it } from "vitest";
import { assessRvolConfidence } from "@/lib/screeners/rvol-confidence";
import { evaluateContinuation } from "@/lib/screeners/continuation";
import {
  impliedBaselineVolumeFromRatio,
  resolveTimeAdjustedRvolConfidenceInput,
} from "@/lib/screeners/continuation-rvol-confidence";
import type { ContinuationInput } from "@/types/continuation";

const SESSION = "2026-08-12";
const POWER_HOUR = "2026-08-12T19:30:00.000Z";

function powerHourBase(overrides: Partial<ContinuationInput> = {}): ContinuationInput {
  return {
    symbol: "AAPL",
    sessionDate: SESSION,
    observedAt: POWER_HOUR,
    price: 10,
    currentSessionVolume: 3_000_000,
    volumeVelocity: "STRONG",
    distanceFromHodPct: 0.8,
    catalystQuality: "STRONG",
    aboveVwap: "TRUE",
    holdingVwapAfterReclaim: "TRUE",
    positiveStructure: "TRUE",
    floatShares: 1_000_000,
    tradeQualityScore: 88,
    tradeQualityLabel: "HIGH_QUALITY",
    timeAdjustedRvol: 3,
    rvol20d: 3,
    rvolBaselineSampleSize: 12,
    rvolBaselineVolume: 1_000_000,
    ...overrides,
  };
}

describe("continuation RVOL confidence wiring", () => {
  it("derives implied TOD baseline volume from session volume and TARVOL", () => {
    expect(impliedBaselineVolumeFromRatio(3_000_000, 3)).toBe(1_000_000);
  });

  it("A. with valid baseline context, TARVOL 3.0x is not LOW-confidence damped in scoring", () => {
    const confidence = assessRvolConfidence(
      resolveTimeAdjustedRvolConfidenceInput(powerHourBase())!,
    );
    expect(confidence.rvolConfidence).toBe("HIGH");
    expect(confidence.rankingRvol).toBeGreaterThanOrEqual(3);

    const result = evaluateContinuation(powerHourBase());
    expect(result.components.rvol20d.rawValue).toBe(3);
    expect(result.components.rvol20d.score).toBe(4);
  });

  it("B. without baseline facts, fail-closed dampening remains", () => {
    const stripped = powerHourBase({
      currentSessionVolume: null,
      rvolBaselineVolume: null,
      rvolBaselineSampleSize: null,
    });
    const confidence = assessRvolConfidence(
      resolveTimeAdjustedRvolConfidenceInput(stripped)!,
    );
    expect(confidence.rvolConfidence).toBe("LOW");

    const result = evaluateContinuation(stripped);
    expect(result.components.rvol20d.score).toBeLessThan(4);
  });
});
