/**
 * RVOL confidence separation: preserve raw evidence, damp ranking when baseline is thin.
 */

export type RvolConfidenceState =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "THIN_BASELINE"
  | "INSUFFICIENT_HISTORY";

export interface RvolConfidenceInput {
  rawRvol: number | null;
  baselineVolume?: number | null;
  baselineSampleSize?: number | null;
  metricKind?: "rvol_5m" | "time_adjusted" | "rvol_20d" | "volume_ratio_prior";
}

export interface RvolConfidenceResult {
  rawRvol: number | null;
  rankingRvol: number | null;
  rvolConfidence: RvolConfidenceState;
  baselineVolume: number | null;
  baselineSampleSize: number | null;
}

const MIN_BASELINE_VOLUME_5M = 500;
const MIN_BASELINE_VOLUME_DAILY = 25_000;
const MIN_SAMPLE_HIGH = 10;
const MIN_SAMPLE_MEDIUM = 5;

function finitePositive(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function minBaselineForKind(kind: RvolConfidenceInput["metricKind"]): number {
  if (kind === "rvol_5m" || kind === "time_adjusted") return MIN_BASELINE_VOLUME_5M;
  return MIN_BASELINE_VOLUME_DAILY;
}

function confidenceFromBaseline(
  baselineVolume: number | null,
  sampleSize: number | null,
  kind: RvolConfidenceInput["metricKind"],
): RvolConfidenceState {
  if (sampleSize !== null && sampleSize < MIN_SAMPLE_MEDIUM) {
    return "INSUFFICIENT_HISTORY";
  }
  if (baselineVolume === null) {
    return sampleSize !== null && sampleSize >= MIN_SAMPLE_HIGH ? "MEDIUM" : "LOW";
  }
  const min = minBaselineForKind(kind);
  if (baselineVolume < min / 10) return "THIN_BASELINE";
  if (baselineVolume < min) return "LOW";
  if (sampleSize !== null && sampleSize >= MIN_SAMPLE_HIGH) return "HIGH";
  if (sampleSize !== null && sampleSize >= MIN_SAMPLE_MEDIUM) return "MEDIUM";
  return "MEDIUM";
}

/** Log-scaled cap for ranking contribution — extreme raw values with thin baselines stay visible but rank lower. */
export function rankingRvolFromRaw(
  rawRvol: number,
  confidence: RvolConfidenceState,
): number {
  if (!Number.isFinite(rawRvol) || rawRvol <= 0) return 0;
  const logScaled = Math.log10(1 + rawRvol) * 10;
  switch (confidence) {
    case "HIGH":
      return Math.max(rawRvol, logScaled);
    case "MEDIUM":
      return Math.max(rawRvol * 0.85, logScaled * 0.9);
    case "LOW":
      return Math.max(rawRvol * 0.65, logScaled * 0.75);
    case "THIN_BASELINE":
      return Math.min(rawRvol, logScaled * 0.55);
    case "INSUFFICIENT_HISTORY":
      return Math.min(rawRvol, logScaled * 0.35);
    default:
      return logScaled;
  }
}

export function assessRvolConfidence(input: RvolConfidenceInput): RvolConfidenceResult {
  const raw = finitePositive(input.rawRvol);
  const baselineVolume = finitePositive(input.baselineVolume);
  const baselineSampleSize = finitePositive(input.baselineSampleSize);
  const rvolConfidence = confidenceFromBaseline(
    baselineVolume,
    baselineSampleSize,
    input.metricKind ?? "time_adjusted",
  );
  if (raw === null) {
    return {
      rawRvol: null,
      rankingRvol: null,
      rvolConfidence,
      baselineVolume,
      baselineSampleSize,
    };
  }
  return {
    rawRvol: raw,
    rankingRvol: rankingRvolFromRaw(raw, rvolConfidence),
    rvolConfidence,
    baselineVolume,
    baselineSampleSize,
  };
}
