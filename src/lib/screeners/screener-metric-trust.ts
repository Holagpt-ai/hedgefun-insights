/**
 * Raw vs ranking trust for extreme Vol/Yday and gap displays.
 */

import { assessRvolConfidence, type RvolConfidenceResult } from "@/lib/screeners/rvol-confidence";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import { pricesImplyCorporateActionScale } from "@/lib/screeners/session-move";

export type VolumeRatioTrustFlag = "THIN_PRIOR_VOLUME_BASELINE" | null;

export type GapTrustFlag = "EXTREME_GAP_REVIEW";

export type GapTrustAssessment = {
  flag: GapTrustFlag | null;
  /** Heuristic only — not verified corporate-action metadata. */
  possibleCorporateActionScale: boolean;
};

const EXTREME_GAP_REVIEW_ABS_PCT = 75;

export function assessVolumeRatioPriorSessionTrust(
  ratio: number | null | undefined,
  priorSessionVolume: number | null | undefined,
): RvolConfidenceResult & { trustFlag: VolumeRatioTrustFlag } {
  const raw = finiteMetric(ratio);
  const assessed = assessRvolConfidence({
    rawRvol: raw,
    baselineVolume: finiteMetric(priorSessionVolume),
    metricKind: "volume_ratio_prior",
  });
  const trustFlag =
    assessed.rvolConfidence === "THIN_BASELINE" ? "THIN_PRIOR_VOLUME_BASELINE" : null;
  return { ...assessed, trustFlag };
}

export function rankingVolumeRatioForDisplay(
  ratio: number | null | undefined,
  priorSessionVolume: number | null | undefined,
): number | null {
  const raw = finiteMetric(ratio);
  if (raw === null) return null;
  const { rankingRvol } = assessVolumeRatioPriorSessionTrust(ratio, priorSessionVolume);
  return rankingRvol;
}

export function assessGapTrust(input: {
  gapPercent: number | null | undefined;
  price: number | null | undefined;
  previousClose: number | null | undefined;
}): GapTrustAssessment {
  const gap = finiteMetric(input.gapPercent);
  const price = finiteMetric(input.price);
  const previousClose = finiteMetric(input.previousClose);
  if (gap === null || price === null || previousClose === null) {
    return { flag: null, possibleCorporateActionScale: false };
  }
  if (Math.abs(gap) < EXTREME_GAP_REVIEW_ABS_PCT) {
    return { flag: null, possibleCorporateActionScale: false };
  }
  const possibleCorporateActionScale = pricesImplyCorporateActionScale(price, previousClose);
  return {
    flag: "EXTREME_GAP_REVIEW",
    possibleCorporateActionScale,
  };
}
