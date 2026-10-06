/**
 * RVOL confidence inputs for continuation scoring — uses existing ratio + volume facts only.
 */

import type { ContinuationInput } from "./continuation-types.ts";
import type { RvolConfidenceInput } from "./rvol-confidence.ts";

function finitePositive(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finiteNonNegativeInt(value: unknown): number | null {
  const n = finitePositive(value);
  if (n === null || !Number.isInteger(n)) return null;
  return n;
}

/**
 * Inverts RVOL = numerator / baseline when both are verified positive (TARVOL or 5m RVOL).
 */
export function impliedBaselineVolumeFromRatio(
  numeratorVolume: number | null | undefined,
  rawRvol: number | null | undefined,
): number | null {
  const numerator = finitePositive(numeratorVolume);
  const ratio = finitePositive(rawRvol);
  if (numerator === null || ratio === null) return null;
  const implied = numerator / ratio;
  return Number.isFinite(implied) && implied > 0 ? implied : null;
}

export function resolveTimeAdjustedRvolConfidenceInput(
  input: ContinuationInput,
): RvolConfidenceInput | null {
  const rawRvol = finitePositive(input.timeAdjustedRvol);
  if (rawRvol === null) return null;

  const baselineVolume = finitePositive(input.rvolBaselineVolume) ??
    impliedBaselineVolumeFromRatio(input.currentSessionVolume, rawRvol);

  const baselineSampleSize = finiteNonNegativeInt(input.rvolBaselineSampleSize);

  return {
    rawRvol,
    metricKind: "time_adjusted",
    baselineVolume,
    baselineSampleSize,
  };
}
