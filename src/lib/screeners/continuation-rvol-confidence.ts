/** Frontend mirror of supabase/functions/_shared/screeners/continuation-rvol-confidence.ts */

import type { ContinuationInput } from "@/types/continuation";
import type { RvolConfidenceInput } from "@/lib/screeners/rvol-confidence";

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
