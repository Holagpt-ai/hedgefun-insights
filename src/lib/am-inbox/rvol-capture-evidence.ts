import type { ContinuationRvolMetricKind } from "@/lib/am-inbox/late-session-continuation-types";

const KIND_PREFIX = "__RVOL_KIND:";
const BASELINE_PREFIX = "__RVOL_BASELINE:";
const SAMPLES_PREFIX = "__RVOL_SAMPLES:";

export function encodeRvolCaptureEvidenceLabels(input: {
  metricKind: ContinuationRvolMetricKind | null;
  baselineVolume: number | null;
  baselineSampleSize: number | null;
}): string[] {
  if (!input.metricKind) return [];
  const labels: string[] = [`${KIND_PREFIX}${input.metricKind}`];
  if (input.baselineVolume !== null && Number.isFinite(input.baselineVolume)) {
    labels.push(`${BASELINE_PREFIX}${input.baselineVolume}`);
  }
  if (input.baselineSampleSize !== null && Number.isInteger(input.baselineSampleSize)) {
    labels.push(`${SAMPLES_PREFIX}${input.baselineSampleSize}`);
  }
  return labels;
}

export function parseRvolCaptureFromEvidenceLabels(
  labels: readonly string[],
): {
  metricKind: ContinuationRvolMetricKind | null;
  baselineVolume: number | null;
  baselineSampleSize: number | null;
} {
  let metricKind: ContinuationRvolMetricKind | null = null;
  let baselineVolume: number | null = null;
  let baselineSampleSize: number | null = null;
  for (const label of labels) {
    if (label.startsWith(KIND_PREFIX)) {
      const kind = label.slice(KIND_PREFIX.length).trim();
      if (kind === "time_adjusted" || kind === "rvol_5m" || kind === "rvol_20d") {
        metricKind = kind;
      }
    } else if (label.startsWith(BASELINE_PREFIX)) {
      const n = Number(label.slice(BASELINE_PREFIX.length));
      if (Number.isFinite(n) && n > 0) baselineVolume = n;
    } else if (label.startsWith(SAMPLES_PREFIX)) {
      const n = Number(label.slice(SAMPLES_PREFIX.length));
      if (Number.isInteger(n) && n >= 0) baselineSampleSize = n;
    }
  }
  return { metricKind, baselineVolume, baselineSampleSize };
}

export function stripInternalRvolCaptureLabels(labels: readonly string[]): string[] {
  return labels.filter(
    (label) =>
      !label.startsWith(KIND_PREFIX) &&
      !label.startsWith(BASELINE_PREFIX) &&
      !label.startsWith(SAMPLES_PREFIX),
  );
}
