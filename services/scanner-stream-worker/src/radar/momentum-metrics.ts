import type { SessionKind } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  MS_PER_MINUTE,
  type ResolvedSessionSchedule,
  easternParts,
  isWithinRegularSession,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import type { SecondBar } from "./types.ts";
import { rollingWindowVolumeCoverage } from "./windows.ts";
import {
  MOMENTUM_WINDOW_5M_MS,
  RVOL_5M_MIN_TOD_SAMPLES,
} from "./momentum-metrics.config.ts";
import {
  windowEligibleForAcceleration,
} from "../../../../src/lib/radar/intraday-participation.ts";
import { VOLUME_ACCEL_MIN_PRIOR_WINDOW_TOTAL_VOLUME } from "../../../../src/config/intraday-participation.config.ts";

const MIN_VELOCITY_COVERED_MS = MS_PER_MINUTE;
const MOMENTUM_WINDOW_MINUTES = MOMENTUM_WINDOW_5M_MS / MS_PER_MINUTE;

export type MomentumMetrics = {
  rvol_5m: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
};

export type TodBucketBaseline = {
  expectedVolume: number;
  sampleCount: number;
};

export function regularSessionBucketIndex(
  eventNowMs: number,
  schedule: ResolvedSessionSchedule,
): number | null {
  const parts = easternParts(eventNowMs);
  if (!parts || schedule.marketStatus === "closed") return null;
  if (!isWithinRegularSession(parts.msOfDay, schedule)) return null;
  const minutesFromOpen =
    (parts.msOfDay - schedule.regularOpenMsOfDay) / MS_PER_MINUTE;
  if (!(minutesFromOpen >= 0)) return null;
  return Math.floor(minutesFromOpen / 5);
}

function shareVelocityFromCoverage(total: number, coveredMs: number): number | null {
  const coveredMinutes = coveredMs / MS_PER_MINUTE;
  if (!(total >= 0) || !(coveredMinutes >= 1)) return null;
  const v = total / coveredMinutes;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/**
 * Percent change in shares/min between the latest 5m window and the prior 5m window.
 */
export function volumeAccelerationPct(
  bars: ReadonlyMap<number, SecondBar>,
  eventNowMs: number,
): number | null {
  const currW = rollingWindowVolumeCoverage(bars, eventNowMs, MOMENTUM_WINDOW_5M_MS);
  const prevW = rollingWindowVolumeCoverage(
    bars,
    eventNowMs - MOMENTUM_WINDOW_5M_MS,
    MOMENTUM_WINDOW_5M_MS,
  );
  if (!currW || !prevW) return null;
  const currFrom = eventNowMs - MOMENTUM_WINDOW_5M_MS;
  const prevFrom = eventNowMs - 2 * MOMENTUM_WINDOW_5M_MS;
  const barList = [...bars.values()];
  if (
    !windowEligibleForAcceleration(barList, currFrom, eventNowMs, MOMENTUM_WINDOW_MINUTES) ||
    !windowEligibleForAcceleration(
      barList,
      prevFrom,
      eventNowMs - MOMENTUM_WINDOW_5M_MS,
      MOMENTUM_WINDOW_MINUTES,
    )
  ) {
    return null;
  }
  if (prevW.total < VOLUME_ACCEL_MIN_PRIOR_WINDOW_TOTAL_VOLUME) return null;
  const currVel = shareVelocityFromCoverage(currW.total, currW.coveredMs);
  const prevVel = shareVelocityFromCoverage(prevW.total, prevW.coveredMs);
  if (currVel === null || prevVel === null || !(prevVel > 0)) return null;
  const pct = ((currVel - prevVel) / prevVel) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 10) / 10 : null;
}

export function computeRvol5m(
  current5mVolume: number,
  baseline: TodBucketBaseline | null | undefined,
): number | null {
  if (baseline === null || baseline === undefined) return null;
  if (baseline.sampleCount < RVOL_5M_MIN_TOD_SAMPLES) return null;
  if (!(baseline.expectedVolume > 0) || !Number.isFinite(baseline.expectedVolume)) {
    return null;
  }
  if (!Number.isFinite(current5mVolume) || current5mVolume < 0) return null;
  if (current5mVolume === 0) return 0;
  const ratio = current5mVolume / baseline.expectedVolume;
  return Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : null;
}

export function computeMomentumMetrics(input: {
  bars: ReadonlyMap<number, SecondBar> | null | undefined;
  eventNowMs: number;
  sessionKind: SessionKind;
  schedule: ResolvedSessionSchedule | null;
  todBaseline: TodBucketBaseline | null | undefined;
}): MomentumMetrics {
  const empty: MomentumMetrics = {
    rvol_5m: null,
    volume_velocity: null,
    volume_acceleration_pct: null,
  };
  if (!input.bars || input.bars.size === 0) return empty;

  const currW = rollingWindowVolumeCoverage(
    input.bars,
    input.eventNowMs,
    MOMENTUM_WINDOW_5M_MS,
  );
  if (!currW || currW.coveredMs < MIN_VELOCITY_COVERED_MS) return empty;

  const volume_velocity = shareVelocityFromCoverage(currW.total, currW.coveredMs);
  const curr5m = currW.total;

  const volume_acceleration_pct = volumeAccelerationPct(
    input.bars,
    input.eventNowMs,
  );

  let rvol_5m: number | null = null;
  if (
    input.sessionKind === "market" &&
    input.schedule &&
    input.todBaseline
  ) {
    const bucket = regularSessionBucketIndex(input.eventNowMs, input.schedule);
    if (bucket !== null) {
      rvol_5m = computeRvol5m(curr5m, input.todBaseline);
    }
  }

  return { rvol_5m, volume_velocity, volume_acceleration_pct };
}
