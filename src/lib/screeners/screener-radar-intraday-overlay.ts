/**
 * Merge canonical Radar V2 intraday metrics onto screener_results rows
 * (Gappers / NHL) without changing rank order or refetching providers.
 */

import { parseTimestampMs } from "@/lib/screeners/contract";
import { easternDate } from "@/lib/radar-v22";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";

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

function sameObservationSession(
  target: Pick<ScreenerResultRow, "provider_as_of">,
  donor: Pick<IntradayMetricDonor, "provider_as_of">,
): boolean {
  const a = easternTradingDate(target.provider_as_of);
  const b = easternTradingDate(donor.provider_as_of);
  return a !== null && b !== null && a === b;
}

export function buildIntradayMetricDonorIndex(
  donors: readonly IntradayMetricDonor[],
): Map<string, IntradayMetricDonor> {
  const index = new Map<string, IntradayMetricDonor>();
  for (const donor of donors) {
    const sym = donor.symbol?.trim().toUpperCase();
    if (!sym) continue;
    index.set(sym, donor);
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
    if (!donor || !sameObservationSession(row, donor)) return row;

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
