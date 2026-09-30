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

/** Groups donors by symbol (multiple snapshots per symbol allowed). */
export function buildIntradayMetricDonorsBySymbol(
  donors: readonly IntradayMetricDonor[],
): Map<string, IntradayMetricDonor[]> {
  const index = new Map<string, IntradayMetricDonor[]>();
  for (const donor of donors) {
    const sym = donor.symbol?.trim().toUpperCase();
    if (!sym) continue;
    if (parseTimestampMs(donor.provider_as_of) === null) continue;
    const list = index.get(sym) ?? [];
    list.push(donor);
    index.set(sym, list);
  }
  for (const [sym, list] of index) {
    index.set(
      sym,
      [...list].sort((a, b) => donorFreshnessMs(b) - donorFreshnessMs(a)),
    );
  }
  return index;
}

/**
 * Target-aware donor: freshest donor that is coherent with this row's timestamp.
 */
export function selectCoherentIntradayDonorForTarget(
  target: Pick<ScreenerResultRow, "symbol" | "provider_as_of">,
  donors: readonly IntradayMetricDonor[],
): IntradayMetricDonor | null {
  const sym = target.symbol.trim().toUpperCase();
  let best: IntradayMetricDonor | null = null;
  let bestMs = -Infinity;

  for (const donor of donors) {
    if (donor.symbol?.trim().toUpperCase() !== sym) continue;
    if (!intradayOverlayObservationCoherent(target, donor)) continue;
    const ms = donorFreshnessMs(donor);
    if (ms > bestMs) {
      bestMs = ms;
      best = donor;
    }
  }

  return best;
}

/** @deprecated Prefer selectCoherentIntradayDonorForTarget — global freshest only. */
export function buildIntradayMetricDonorIndex(
  donors: readonly IntradayMetricDonor[],
): Map<string, IntradayMetricDonor> {
  const bySymbol = buildIntradayMetricDonorsBySymbol(donors);
  const index = new Map<string, IntradayMetricDonor>();
  for (const [sym, list] of bySymbol) {
    if (list[0]) index.set(sym, list[0]!);
  }
  return index;
}

export function overlayCanonicalIntradayMetrics<T extends ScreenerResultRow>(
  rows: readonly T[],
  donors: readonly IntradayMetricDonor[],
): T[] {
  if (rows.length === 0 || donors.length === 0) return [...rows];

  return rows.map((row) => {
    const donor = selectCoherentIntradayDonorForTarget(row, donors);
    if (!donor) return row;

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
