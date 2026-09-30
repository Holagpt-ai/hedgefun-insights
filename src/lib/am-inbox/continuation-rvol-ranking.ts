import type {
  ContinuationRvolMetricKind,
  LateSessionContinuationContext,
} from "@/lib/am-inbox/late-session-continuation-types";
import {
  assessRvolConfidence,
  rankingRvolFromRaw,
  type RvolConfidenceState,
} from "@/lib/screeners/rvol-confidence";

export type { ContinuationRvolMetricKind };

/** Unknown baseline: conservative ranking authority (never uses session volume as denominator). */
const UNKNOWN_BASELINE_CONFIDENCE: RvolConfidenceState = "INSUFFICIENT_HISTORY";

/**
 * Late-session `context.rvol` is the raw participation ratio captured at handoff time.
 * Today that is usually persisted `rvol_20d` (session volume vs 20D average) from screener/Radar rows.
 * It is not current session volume and must not be used as RVOL baseline volume.
 */
export function resolveContinuationRvolMetricKind(
  context: LateSessionContinuationContext,
): ContinuationRvolMetricKind {
  return context.rvolMetricKind ?? "rvol_20d";
}

export function continuationRankingRvolFromContext(
  context: LateSessionContinuationContext,
): number {
  const raw = context.rvol;
  if (raw === null || !Number.isFinite(raw) || raw <= 0) return 0;

  const metricKind = resolveContinuationRvolMetricKind(context);
  const baselineVolume = context.rvolBaselineVolume ?? null;
  const baselineSampleSize = context.rvolBaselineSampleSize ?? null;

  if (baselineVolume === null && baselineSampleSize === null) {
    return rankingRvolFromRaw(raw, UNKNOWN_BASELINE_CONFIDENCE);
  }

  const assessed = assessRvolConfidence({
    rawRvol: raw,
    baselineVolume,
    baselineSampleSize,
    metricKind,
  });
  return assessed.rankingRvol ?? rankingRvolFromRaw(raw, UNKNOWN_BASELINE_CONFIDENCE);
}
