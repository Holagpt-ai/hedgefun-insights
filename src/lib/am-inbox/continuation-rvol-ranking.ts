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

/** No persisted baseline metadata — use neutral authority (not INSUFFICIENT_HISTORY penalty). */
const NEUTRAL_RANKING_CONFIDENCE: RvolConfidenceState = "MEDIUM";

/**
 * Late-session `context.rvol` is the raw participation ratio captured at handoff time.
 * Today that is usually persisted `rvol_20d` (session volume vs 20D average) from screener/Radar rows.
 * It is not current session volume and must not be used as RVOL baseline volume.
 */
/** Returns null when persisted capture has no verified metric kind (never infer 20d/5m). */
export function resolveContinuationRvolMetricKind(
  context: LateSessionContinuationContext,
): ContinuationRvolMetricKind | null {
  return context.rvolMetricKind ?? null;
}

export function continuationRankingRvolFromContext(
  context: LateSessionContinuationContext,
): number {
  const raw = context.rvol;
  if (raw === null || !Number.isFinite(raw) || raw <= 0) return 0;

  const metricKind = resolveContinuationRvolMetricKind(context);
  const baselineVolume = context.rvolBaselineVolume ?? null;
  const baselineSampleSize = context.rvolBaselineSampleSize ?? null;

  if (metricKind === null && baselineVolume === null && baselineSampleSize === null) {
    return rankingRvolFromRaw(raw, NEUTRAL_RANKING_CONFIDENCE);
  }

  const assessed = assessRvolConfidence({
    rawRvol: raw,
    baselineVolume,
    baselineSampleSize,
    metricKind: metricKind ?? "time_adjusted",
  });
  return assessed.rankingRvol ?? rankingRvolFromRaw(raw, NEUTRAL_RANKING_CONFIDENCE);
}
