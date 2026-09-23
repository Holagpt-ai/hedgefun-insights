import type { SessionKind } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  MS_PER_MINUTE,
  type ResolvedSessionSchedule,
  easternParts,
  isWithinRegularSession,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import type { SecondBar } from "./types.ts";
import { rollingVolume } from "./windows.ts";
import {
  MOMENTUM_WINDOW_5M_MS,
  RVOL_5M_MIN_TOD_SAMPLES,
} from "./momentum-metrics.config.ts";

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

function volumeInWindow(
  bars: ReadonlyMap<number, SecondBar>,
  eventNowMs: number,
  windowMs: number,
): number | null {
  if (!(windowMs > 0)) return null;
  const { total } = rollingVolume(bars, eventNowMs, windowMs, "volume");
  if (!Number.isFinite(total)) return null;
  return total;
}

/**
 * Percent change in shares/min between the latest 5m window and the prior 5m window.
 */
export function volumeAccelerationPct(
  bars: ReadonlyMap<number, SecondBar>,
  eventNowMs: number,
): number | null {
  const curr = volumeInWindow(bars, eventNowMs, MOMENTUM_WINDOW_5M_MS);
  const prev = volumeInWindow(
    bars,
    eventNowMs - MOMENTUM_WINDOW_5M_MS,
    MOMENTUM_WINDOW_5M_MS,
  );
  if (curr === null || prev === null) return null;
  const currVel = curr / 5;
  const prevVel = prev / 5;
  if (!(prevVel > 0) || !Number.isFinite(prevVel)) return null;
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

  const curr5m = volumeInWindow(input.bars, input.eventNowMs, MOMENTUM_WINDOW_5M_MS);
  if (curr5m === null) return empty;

  const volume_velocity = Number.isFinite(curr5m)
    ? Math.round((curr5m / 5) * 100) / 100
    : null;

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
