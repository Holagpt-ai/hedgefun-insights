import { assertEquals } from "jsr:@std/assert";
import { assessRvolConfidence } from "./rvol-confidence.ts";
import { evaluateContinuation } from "./continuation-v1.ts";
import {
  impliedBaselineVolumeFromRatio,
  resolveTimeAdjustedRvolConfidenceInput,
} from "./continuation-rvol-confidence.ts";
import type { ContinuationInput } from "./continuation-types.ts";

const POWER_HOUR = "2026-08-12T19:30:00.000Z";

function powerHourInput(overrides: Partial<ContinuationInput> = {}): ContinuationInput {
  return {
    symbol: "AAPL",
    sessionDate: "2026-08-12",
    observedAt: POWER_HOUR,
    price: 10,
    currentSessionVolume: 3_000_000,
    volumeVelocity: "STRONG",
    distanceFromHodPct: 0.8,
    catalystQuality: "STRONG",
    aboveVwap: "TRUE",
    timeAdjustedRvol: 3,
    rvol20d: 3,
    rvolBaselineSampleSize: 12,
    rvolBaselineVolume: 1_000_000,
    ...overrides,
  };
}

Deno.test("implied baseline volume inverts TARVOL ratio", () => {
  assertEquals(impliedBaselineVolumeFromRatio(3_000_000, 3), 1_000_000);
});

Deno.test("continuation scoring trusts TARVOL 3.0 when baseline context is present", () => {
  const confidence = assessRvolConfidence(
    resolveTimeAdjustedRvolConfidenceInput(powerHourInput())!,
  );
  assertEquals(confidence.rvolConfidence, "HIGH");

  const result = evaluateContinuation(powerHourInput());
  assertEquals(result.components.rvol20d.score, 4);
});

Deno.test("continuation scoring stays dampened without baseline facts", () => {
  const stripped = powerHourInput({
    currentSessionVolume: null,
    rvolBaselineVolume: null,
    rvolBaselineSampleSize: null,
  });
  const confidence = assessRvolConfidence(
    resolveTimeAdjustedRvolConfidenceInput(stripped)!,
  );
  assertEquals(confidence.rvolConfidence, "LOW");
  assertEquals(evaluateContinuation(stripped).components.rvol20d.score, 3);
});
