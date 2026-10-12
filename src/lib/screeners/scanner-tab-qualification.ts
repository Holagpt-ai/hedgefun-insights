/**
 * Distinct Radar V2 tab qualification and ranking.
 *
 * Calculation only — no provider transport and no UI rendering.
 * Edge Polygon snapshot tabs keep their own 3× / 4× prior-day gates in
 * `selection.ts`. This module is the Radar-backed path.
 *
 * Volume is king: names at or above ~100,000 shares/min rank ahead of
 * weaker liquidity even when secondary ratios are larger.
 */

import { isFiniteNumber, isPositiveFinite } from "@/lib/screeners/contract";
import { sessionMovePercent, volumeVersusPriorSession } from "@/lib/screeners/session-move";

/** Narrow Radar candidate fields used for tab qualification and ranking. */
export type RadarTabCandidate = {
  symbol: string;
  last_price: number | null;
  previous_close?: number | null;
  session_volume: number | null;
  prior_session_volume?: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
  volume_60s: number | null;
  time_adjusted_rvol?: number | null;
};

/** Short-window participation floor used for volume-first tiering. */
export const SCANNER_HIGH_ACTIVITY_SHARES_PER_MIN = 100_000;

/** Edge + Radar unusual-volume prior-session ratio gate. */
export const UNUSUAL_VOLUME_PRIOR_RATIO = 4;

/** Edge volume-spike prior-session ratio gate (Radar uses velocity instead). */
export const VOLUME_SPIKE_PRIOR_RATIO = 3;

/**
 * Time-adjusted RVOL gate for Unusual Volume when prior-session volume is
 * missing. Distinct from 5-minute TOD RVOL and from daily RVOL.
 */
export const UNUSUAL_VOLUME_TIME_ADJUSTED_RVOL = 2;

export function radarSessionMovePercent(row: RadarTabCandidate): number | null {
  return sessionMovePercent(
    isFiniteNumber(row.last_price) ? row.last_price : null,
    isPositiveFinite(row.previous_close) ? row.previous_close : null,
  );
}

export function radarVolumeVersusPriorSession(row: RadarTabCandidate): number | null {
  return volumeVersusPriorSession(
    isFiniteNumber(row.session_volume) ? row.session_volume : null,
    isPositiveFinite(row.prior_session_volume) ? row.prior_session_volume : null,
  );
}

function hasPositiveSessionVolume(row: RadarTabCandidate): boolean {
  return isFiniteNumber(row.session_volume) && (row.session_volume as number) > 0;
}

/** Volume Spikes: short-window acceleration / velocity, not cumulative VOL/YDAY. */
export function qualifiesRadarVolumeSpike(row: RadarTabCandidate): boolean {
  if (!hasPositiveSessionVolume(row)) return false;
  if (isFiniteNumber(row.volume_velocity) && (row.volume_velocity as number) > 0) return true;
  return isFiniteNumber(row.volume_acceleration_pct);
}

/**
 * Unusual Volume: cumulative session vs prior session (≥4×) or verified
 * time-adjusted RVOL. Never substitutes 5m RVOL or daily RVOL.
 */
export function qualifiesRadarUnusualVolume(row: RadarTabCandidate): boolean {
  if (!hasPositiveSessionVolume(row)) return false;
  const priorRatio = radarVolumeVersusPriorSession(row);
  if (priorRatio !== null && priorRatio >= UNUSUAL_VOLUME_PRIOR_RATIO) return true;
  return (
    isFiniteNumber(row.time_adjusted_rvol) &&
    (row.time_adjusted_rvol as number) >= UNUSUAL_VOLUME_TIME_ADJUSTED_RVOL
  );
}

/** Gainers/Losers: session MOVE vs previous regular close — not 15s/60s. */
export function qualifiesRadarGainersLosers(row: RadarTabCandidate): boolean {
  const move = radarSessionMovePercent(row);
  return move !== null && move !== 0;
}

export function qualifyRadarCandidateForTab(
  row: RadarTabCandidate,
  tabId: string,
): boolean {
  switch (tabId) {
    case "day_trade_radar":
      return true;
    case "volume_spikes":
      return qualifiesRadarVolumeSpike(row);
    case "unusual_volume":
      return qualifiesRadarUnusualVolume(row);
    case "gainers_losers":
      return qualifiesRadarGainersLosers(row);
    default:
      return false;
  }
}

function descKey(value: number | null | undefined): number {
  return isFiniteNumber(value) ? (value as number) : Number.NEGATIVE_INFINITY;
}

/**
 * High-activity names (≥100k shares/min, or ≥100k shares in the last 60s)
 * occupy the leading volume-first tier.
 */
export function highActivityTier(row: RadarTabCandidate): number {
  if (isFiniteNumber(row.volume_velocity) && (row.volume_velocity as number) >= SCANNER_HIGH_ACTIVITY_SHARES_PER_MIN) {
    return 0;
  }
  if (isFiniteNumber(row.volume_60s) && (row.volume_60s as number) >= SCANNER_HIGH_ACTIVITY_SHARES_PER_MIN) {
    return 0;
  }
  return 1;
}

export function compareRadarVolumeSpikes(
  a: RadarTabCandidate,
  b: RadarTabCandidate,
): number {
  let d = highActivityTier(a) - highActivityTier(b);
  if (d !== 0) return d;
  d = descKey(b.volume_velocity) - descKey(a.volume_velocity);
  if (d !== 0) return d;
  d = descKey(b.session_volume) - descKey(a.session_volume);
  if (d !== 0) return d;
  return a.symbol.localeCompare(b.symbol);
}

export function compareRadarUnusualVolume(
  a: RadarTabCandidate,
  b: RadarTabCandidate,
): number {
  let d = highActivityTier(a) - highActivityTier(b);
  if (d !== 0) return d;
  d = descKey(b.time_adjusted_rvol) - descKey(a.time_adjusted_rvol);
  if (d !== 0) return d;
  d = descKey(radarVolumeVersusPriorSession(b)) - descKey(radarVolumeVersusPriorSession(a));
  if (d !== 0) return d;
  d = descKey(b.session_volume) - descKey(a.session_volume);
  if (d !== 0) return d;
  return a.symbol.localeCompare(b.symbol);
}

export function compareRadarGainersLosers(
  a: RadarTabCandidate,
  b: RadarTabCandidate,
): number {
  let d = highActivityTier(a) - highActivityTier(b);
  if (d !== 0) return d;
  const moveA = radarSessionMovePercent(a);
  const moveB = radarSessionMovePercent(b);
  d = descKey(moveB === null ? null : Math.abs(moveB)) - descKey(moveA === null ? null : Math.abs(moveA));
  if (d !== 0) return d;
  d = descKey(b.session_volume) - descKey(a.session_volume);
  if (d !== 0) return d;
  return a.symbol.localeCompare(b.symbol);
}

export function rankRadarCandidatesForTab<T extends RadarTabCandidate>(
  candidates: readonly T[],
  tabId: string,
  volumeFirstCompare: (a: T, b: T) => number,
): T[] {
  const sorted = candidates.slice();
  if (tabId === "volume_spikes") return sorted.sort(compareRadarVolumeSpikes);
  if (tabId === "unusual_volume") return sorted.sort(compareRadarUnusualVolume);
  if (tabId === "gainers_losers") return sorted.sort(compareRadarGainersLosers);
  return sorted.sort(volumeFirstCompare);
}

export function radarTabFallsBackWhenEmpty(tabId: string): boolean {
  return tabId === "volume_spikes" || tabId === "unusual_volume" || tabId === "gainers_losers";
}
