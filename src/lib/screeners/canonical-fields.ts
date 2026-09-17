/**
 * Canonical foundational screener field contract (display enrichment only).
 *
 * Sentinel ranking stays volume-first. These fields describe verified session
 * semantics for display — never for Discovery Rank reordering.
 */

import {
  expectedVolumeRatio,
  isFiniteNumber,
  isPositiveFinite,
} from "@/lib/screeners/contract";

export type CanonicalFieldSource =
  | "screener_results"
  | "radar_v22_board"
  | "polygon_snapshot";

export type CanonicalFieldName =
  | "last"
  | "prior_close"
  | "change_percent"
  | "today_volume"
  | "prior_day_volume"
  | "instrument_type";

export interface CanonicalFoundationalFields {
  symbol: string;
  last: number | null;
  prior_close: number | null;
  change_percent: number | null;
  today_volume: number | null;
  prior_day_volume: number | null;
  instrument_type: string | null;
  data_as_of: string | null;
  field_sources: Partial<Record<CanonicalFieldName, CanonicalFieldSource>>;
}

/** Max relative price divergence allowed when joining a donor snapshot to Sentinel. */
export const CANONICAL_PRICE_DIVERGENCE_RATIO = 0.01;

export function pricesWithinCanonicalTolerance(
  donorPrice: number,
  sentinelPrice: number,
): boolean {
  if (!(donorPrice > 0) || !(sentinelPrice > 0)) return false;
  return (
    Math.abs(donorPrice - sentinelPrice) / sentinelPrice <=
    CANONICAL_PRICE_DIVERGENCE_RATIO
  );
}

/**
 * Prior/ratio pair is valid when prior is positive and ratio matches persisted
 * volumes at one decimal. When sentinel volume differs, recompute ratio from
 * sentinel volume — never fabricate prior volume.
 */
export function canonicalPriorRatioFromDonor(
  sentinelVolume: number | null | undefined,
  donorPrior: number | null | undefined,
  donorRatio: number | null | undefined,
  donorVolume?: number | null,
): { prior_session_volume: number; volume_ratio_prior_session: number } | null {
  if (!isPositiveFinite(sentinelVolume) || !isPositiveFinite(donorPrior)) {
    return null;
  }
  if (isPositiveFinite(donorRatio) && isPositiveFinite(donorVolume)) {
    if (expectedVolumeRatio(donorVolume, donorPrior) !== donorRatio) {
      return null;
    }
  }
  const ratio = expectedVolumeRatio(sentinelVolume, donorPrior);
  if (!(ratio > 0)) return null;
  return {
    prior_session_volume: donorPrior,
    volume_ratio_prior_session: ratio,
  };
}

/** Regular-session change_percent must never come from short-window Radar moves. */
export function isVerifiedRegularSessionChange(
  value: number | null | undefined,
): value is number {
  return isFiniteNumber(value);
}

export function hasCanonicalPriorDayVolume(
  prior: number | null | undefined,
  ratio: number | null | undefined,
  volume?: number | null,
): boolean {
  return canonicalPriorRatioFromDonor(volume, prior, ratio, volume) !== null;
}
