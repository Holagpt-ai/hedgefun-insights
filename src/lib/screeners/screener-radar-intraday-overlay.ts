/**
 * Merge canonical Radar V2 intraday metrics onto screener_results rows
 * (Gappers / NHL) without changing rank order or refetching providers.
 */

import {
  parseTimestampMs,
  SCREENER_STALE_AFTER_MS,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";
import { easternDate } from "@/lib/radar-v22";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";

/**
 * Maximum provider_as_of skew allowed when overlaying Radar intraday metrics
 * onto screener_results rows. Matches screener stale cadence (20 minutes).
 * Observations more than this apart are treated as different snapshots.
 */
export const SCREENER_INTRADAY_OVERLAY_MAX_SKEW_MS = SCREENER_STALE_AFTER_MS;

export type IntradayMetricDonor = Pick<
  RadarV2ScreenerRow,
  | "symbol"
  | "provider_as_of"
  | "rvol_5m"
  | "vol_velocity"
  | "time_adjusted_rvol"
  | "volume_acceleration_pct"
>;

function easternTradingDate(iso: string | null | undefined): string | null {
  const ms = parseTimestampMs(iso);
  if (ms === null) return null;
  return easternDate(ms);
}

function providerSkewMs(
  targetIso: string | null | undefined,
  donorIso: string | null | undefined,
): number | null {
  const targetMs = parseTimestampMs(targetIso);
  const donorMs = parseTimestampMs(donorIso);
  if (targetMs === null || donorMs === null) return null;
  return Math.abs(targetMs - donorMs);
}

/** Same ET session and provider timestamps within overlay skew tolerance. */
export function intradayOverlayObservationCoherent(
  target: Pick<ScreenerResultRow, "provider_as_of">,
  donor: Pick<IntradayMetricDonor, "provider_as_of">,
): boolean {
  const targetDate = easternTradingDate(target.provider_as_of);
  const donorDate = easternTradingDate(donor.provider_as_of);
  if (!targetDate || !donorDate || targetDate !== donorDate) return false;

  const skew = providerSkewMs(target.provider_as_of, donor.provider_as_of);
  if (skew === null) return false;
  return skew <= SCREENER_INTRADAY_OVERLAY_MAX_SKEW_MS;
}

function donorFreshnessMs(donor: IntradayMetricDonor): number {
  return parseTimestampMs(donor.provider_as_of) ?? -Infinity;
}

/**
 * One donor per symbol: freshest valid provider_as_of wins (not input order).
 */
export function buildIntradayMetricDonorIndex(
  donors: readonly IntradayMetricDonor[],
): Map<string, IntradayMetricDonor> {
  const index = new Map<string, IntradayMetricDonor>();
  for (const donor of donors) {
    const sym = donor.symbol?.trim().toUpperCase();
    if (!sym) continue;
    if (parseTimestampMs(donor.provider_as_of) === null) continue;

    const prev = index.get(sym);
    if (!prev || donorFreshnessMs(donor) > donorFreshnessMs(prev)) {
      index.set(sym, donor);
    }
  }
  return index;
}

export function overlayCanonicalIntradayMetrics<T extends ScreenerResultRow>(
  rows: readonly T[],
  donors: readonly IntradayMetricDonor[],
): T[] {
  if (rows.length === 0 || donors.length === 0) return [...rows];
  const index = buildIntradayMetricDonorIndex(donors);

  return rows.map((row) => {
    const donor = index.get(row.symbol.trim().toUpperCase());
    if (!donor || !intradayOverlayObservationCoherent(row, donor)) return row;

    const extended = row as T & IntradayMetricDonor;
    const next = { ...extended };

    if (finiteMetric(next.rvol_5m) === null && finiteMetric(donor.rvol_5m) !== null) {
      next.rvol_5m = donor.rvol_5m;
    }
    if (finiteMetric(next.vol_velocity) === null && finiteMetric(donor.vol_velocity) !== null) {
      next.vol_velocity = donor.vol_velocity;
    }
    if (
      finiteMetric(next.time_adjusted_rvol) === null &&
      finiteMetric(donor.time_adjusted_rvol) !== null
    ) {
      next.time_adjusted_rvol = donor.time_adjusted_rvol;
    }
    if (
      finiteMetric(next.volume_acceleration_pct) === null &&
      finiteMetric(donor.volume_acceleration_pct) !== null
    ) {
      next.volume_acceleration_pct = donor.volume_acceleration_pct;
    }

    return next;
  });
}
