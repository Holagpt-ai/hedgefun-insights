const KIND_PREFIX = "__RVOL_KIND:";
const BASELINE_PREFIX = "__RVOL_BASELINE:";
const SAMPLES_PREFIX = "__RVOL_SAMPLES:";

export type RvolCaptureMetricKind = "time_adjusted" | "rvol_5m" | "rvol_20d";

export function encodeRvolCaptureEvidenceLabels(input: {
  metricKind: RvolCaptureMetricKind | null;
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

function finitePositive(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function impliedBaseline(numerator: number | null, ratio: number | null): number | null {
  if (numerator === null || ratio === null) return null;
  const implied = numerator / ratio;
  return Number.isFinite(implied) && implied > 0 ? implied : null;
}

/** Edge capture: one consistent RVOL tuple from Radar V22 candidate facts. */
export function resolveV22RvolCapture(row: {
  time_adjusted_rvol?: number | null;
  rvol_5m?: number | null;
  session_volume?: number | null;
  volume_5m?: number | null;
  participation_baseline_session_count?: number | null;
}): {
  rawRvol: number | null;
  metricKind: RvolCaptureMetricKind | null;
  baselineVolume: number | null;
  baselineSampleSize: number | null;
} {
  const samples = row.participation_baseline_session_count;
  const sampleSize = samples != null && Number.isInteger(samples) && samples >= 0
    ? samples
    : null;

  const tarvol = finitePositive(row.time_adjusted_rvol);
  if (tarvol !== null) {
    const baseline = impliedBaseline(finitePositive(row.session_volume), tarvol);
    if (baseline !== null || (sampleSize !== null && sampleSize >= 5)) {
      return {
        rawRvol: tarvol,
        metricKind: "time_adjusted",
        baselineVolume: baseline,
        baselineSampleSize: sampleSize,
      };
    }
  }

  const r5 = finitePositive(row.rvol_5m);
  if (r5 !== null) {
    const baseline = impliedBaseline(finitePositive(row.volume_5m), r5);
    if (baseline !== null || (sampleSize !== null && sampleSize >= 5)) {
      return {
        rawRvol: r5,
        metricKind: "rvol_5m",
        baselineVolume: baseline,
        baselineSampleSize: sampleSize,
      };
    }
  }

  return {
    rawRvol: tarvol ?? r5,
    metricKind: null,
    baselineVolume: null,
    baselineSampleSize: null,
  };
}
