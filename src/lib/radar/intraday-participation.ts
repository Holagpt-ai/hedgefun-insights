/**
 * Intraday Participation Intelligence V1 — pure deterministic metrics.
 *
 * Minute windows (5m / 15m / 60m) are distinct from Radar Event Engine second windows.
 */

import {
  INTRADAY_PARTICIPATION_MIN_BASELINE_SESSIONS,
  INTRADAY_PARTICIPATION_TARGET_BASELINE_SESSIONS,
  PARTICIPATION_ACCEL_COOLING_MAX,
  PARTICIPATION_ACCEL_RISING_MAX,
  PARTICIPATION_ACCEL_STEADY_MAX,
  PARTICIPATION_ACCEL_SURGING_MAX,
  type ParticipationState,
} from "../../config/intraday-participation.config.ts";

export const MINUTE_MS = 60_000;

export type MinuteBarSlice = {
  startMs: number;
  volume: number;
  dollarVolume: number;
  lateCorrected?: boolean;
};

export type CumulativeBaselineSnapshot = {
  avgCumulativeVolume: number;
  historicalSessionCount: number;
  targetSessionCount: number;
  sufficient: boolean;
  /** When true, baseline must not be used (split/incoherent history). */
  invalid: boolean;
};

export type IntradayParticipationSnapshot = {
  time_adjusted_rvol: number | null;
  volume_5m: number | null;
  volume_15m: number | null;
  volume_60m: number | null;
  volume_velocity_5m: number | null;
  volume_velocity_15m: number | null;
  volume_velocity_60m: number | null;
  volume_acceleration_pct: number | null;
  dollar_volume_velocity_5m: number | null;
  participation_state: ParticipationState;
  participation_baseline_session_count: number | null;
  participation_baseline_ready: boolean;
  participation_calculated_at: string | null;
  participation_source_as_of: string | null;
  participation_freshness: "fresh" | "stale" | "unavailable";
};

function finite(n: number | null | undefined): n is number {
  return n !== null && n !== undefined && Number.isFinite(n);
}

export function rollingMinuteVolume(
  bars: readonly MinuteBarSlice[],
  eventNowMs: number,
  windowMinutes: number,
): { volume: number; dollarVolume: number; coveredMinutes: number; lateCorrection: boolean } | null {
  if (!(windowMinutes > 0) || !Number.isFinite(eventNowMs)) return null;
  const windowMs = windowMinutes * MINUTE_MS;
  const from = eventNowMs - windowMs;
  let volume = 0;
  let dollarVolume = 0;
  let minStart: number | null = null;
  let lateCorrection = false;
  for (const bar of bars) {
    if (bar.startMs >= from && bar.startMs < eventNowMs) {
      volume += bar.volume;
      dollarVolume += bar.dollarVolume;
      minStart = minStart === null ? bar.startMs : Math.min(minStart, bar.startMs);
      if (bar.lateCorrected) lateCorrection = true;
    }
  }
  if (minStart === null) return null;
  const coveredMs = Math.min(windowMs, eventNowMs - minStart);
  const coveredMinutes = coveredMs / MINUTE_MS;
  if (!(coveredMinutes >= 1)) return null;
  return { volume, dollarVolume, coveredMinutes, lateCorrection };
}

/** shares per minute — normalizes partial windows using verified elapsed coverage. */
export function shareVelocity(
  volume: number,
  coveredMinutes: number,
): number | null {
  if (!(volume >= 0) || !(coveredMinutes >= 1)) return null;
  const v = volume / coveredMinutes;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

export function dollarVolumeVelocity(
  dollarVolume: number,
  coveredMinutes: number,
): number | null {
  if (!(dollarVolume >= 0) || !(coveredMinutes >= 1)) return null;
  const v = dollarVolume / coveredMinutes;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/**
 * time_adjusted_rvol =
 *   current cumulative session volume through clock T
 *   / mean(prior completed session cumulative volume through same clock T)
 */
export function computeTimeAdjustedRvol(
  currentCumulativeVolume: number | null,
  baseline: CumulativeBaselineSnapshot | null,
): number | null {
  if (!baseline || baseline.invalid || !baseline.sufficient) return null;
  if (!finite(currentCumulativeVolume) || currentCumulativeVolume < 0) return null;
  if (!(baseline.avgCumulativeVolume > 0)) return null;
  if (currentCumulativeVolume === 0) return 0;
  const ratio = currentCumulativeVolume / baseline.avgCumulativeVolume;
  return Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : null;
}

export function baselineSufficiency(
  historicalSessionCount: number,
  minSessions: number = INTRADAY_PARTICIPATION_MIN_BASELINE_SESSIONS,
): boolean {
  return historicalSessionCount >= minSessions;
}

/**
 * Acceleration (canonical, shared with momentum-metrics):
 * ((curr5mSharesMin - prev5mSharesMin) / prev5mSharesMin) * 100
 * Returns null when prev window is 0, missing, or non-finite.
 */
export function volumeAccelerationPctFromMinuteWindows(
  bars: readonly MinuteBarSlice[],
  eventNowMs: number,
): number | null {
  const curr = rollingMinuteVolume(bars, eventNowMs, 5);
  const prev = rollingMinuteVolume(bars, eventNowMs - 5 * MINUTE_MS, 5);
  if (!curr || !prev) return null;
  const currVel = shareVelocity(curr.volume, curr.coveredMinutes);
  const prevVel = shareVelocity(prev.volume, prev.coveredMinutes);
  if (currVel === null || prevVel === null || !(prevVel > 0)) return null;
  const pct = ((currVel - prevVel) / prevVel) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null;
}

export function participationStateFromAcceleration(
  accelerationPct: number | null,
): ParticipationState {
  if (accelerationPct === null || !Number.isFinite(accelerationPct)) {
    return "UNAVAILABLE";
  }
  if (accelerationPct <= PARTICIPATION_ACCEL_COOLING_MAX) return "COOLING";
  if (accelerationPct < PARTICIPATION_ACCEL_STEADY_MAX) return "STEADY";
  if (accelerationPct < PARTICIPATION_ACCEL_RISING_MAX) return "RISING";
  if (accelerationPct < PARTICIPATION_ACCEL_SURGING_MAX) return "SURGING";
  return "SURGING";
}

/** Detect structurally incoherent 5m history (likely unadjusted split noise). */
export function detectBaselineCorporateActionAnomaly(
  closes: readonly number[],
): boolean {
  const valid = closes.filter((c) => c > 0 && Number.isFinite(c));
  if (valid.length < 2) return false;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min <= 0) return true;
  return max / min > 40;
}

export function computeIntradayParticipation(input: {
  bars: readonly MinuteBarSlice[];
  eventNowMs: number;
  cumulativeSessionVolume: number | null;
  baseline: CumulativeBaselineSnapshot | null;
  feedStale: boolean;
  calculatedAtIso: string | null;
  sourceAsOfIso: string | null;
  /** When provided, reused instead of recomputing (keeps single acceleration definition). */
  volumeAccelerationPct?: number | null;
}): IntradayParticipationSnapshot {
  const staleInput = input.feedStale ||
    [5, 15, 60].some((m) => {
      const w = rollingMinuteVolume(input.bars, input.eventNowMs, m);
      return w?.lateCorrection === true;
    });

  const vol5 = rollingMinuteVolume(input.bars, input.eventNowMs, 5);
  const vol15 = rollingMinuteVolume(input.bars, input.eventNowMs, 15);
  const vol60 = rollingMinuteVolume(input.bars, input.eventNowMs, 60);

  const unavailable = staleInput
    ? {
      time_adjusted_rvol: null,
      volume_5m: null,
      volume_15m: null,
      volume_60m: null,
      volume_velocity_5m: null,
      volume_velocity_15m: null,
      volume_velocity_60m: null,
      volume_acceleration_pct: null,
      dollar_volume_velocity_5m: null,
      participation_state: "UNAVAILABLE" as const,
      participation_baseline_session_count: input.baseline?.historicalSessionCount ?? null,
      participation_baseline_ready: input.baseline?.sufficient ?? false,
      participation_calculated_at: input.calculatedAtIso,
      participation_source_as_of: input.sourceAsOfIso,
      participation_freshness: "stale" as const,
    }
    : null;

  if (unavailable) return unavailable;

  const acceleration = input.volumeAccelerationPct !== undefined
    ? input.volumeAccelerationPct
    : volumeAccelerationPctFromMinuteWindows(input.bars, input.eventNowMs);

  const baselineReady = input.baseline !== null &&
    !input.baseline.invalid &&
    baselineSufficiency(input.baseline.historicalSessionCount);

  return {
    time_adjusted_rvol: computeTimeAdjustedRvol(
      input.cumulativeSessionVolume,
      input.baseline,
    ),
    volume_5m: vol5?.volume ?? null,
    volume_15m: vol15?.volume ?? null,
    volume_60m: vol60?.volume ?? null,
    volume_velocity_5m: vol5 ? shareVelocity(vol5.volume, vol5.coveredMinutes) : null,
    volume_velocity_15m: vol15 ? shareVelocity(vol15.volume, vol15.coveredMinutes) : null,
    volume_velocity_60m: vol60 ? shareVelocity(vol60.volume, vol60.coveredMinutes) : null,
    volume_acceleration_pct: acceleration,
    dollar_volume_velocity_5m: vol5
      ? dollarVolumeVelocity(vol5.dollarVolume, vol5.coveredMinutes)
      : null,
    participation_state: participationStateFromAcceleration(acceleration),
    participation_baseline_session_count: input.baseline?.historicalSessionCount ?? null,
    participation_baseline_ready: baselineReady,
    participation_calculated_at: input.calculatedAtIso,
    participation_source_as_of: input.sourceAsOfIso,
    participation_freshness: baselineReady ? "fresh" : "unavailable",
  };
}

export function emptyCumulativeBaseline(): CumulativeBaselineSnapshot {
  return {
    avgCumulativeVolume: 0,
    historicalSessionCount: 0,
    targetSessionCount: INTRADAY_PARTICIPATION_TARGET_BASELINE_SESSIONS,
    sufficient: false,
    invalid: false,
  };
}
