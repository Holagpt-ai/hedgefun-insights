import type { SessionKind } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  easternParts,
  resolveScheduleAt,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import type { CalendarExceptionRow } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  computeIntradayParticipation,
  type IntradayParticipationSnapshot,
  type MinuteBarSlice,
} from "../../../../src/lib/radar/intraday-participation.ts";
import type { ParticipationBaselineCache } from "./participation-baseline-cache.ts";
import type { SecondBar } from "./types.ts";

export function secondBarsToMinuteSlices(
  bars: ReadonlyMap<number, SecondBar> | null | undefined,
): MinuteBarSlice[] {
  if (!bars) return [];
  return [...bars.values()].map((bar) => ({
    startMs: bar.startMs,
    volume: bar.volume,
    dollarVolume: bar.dollarVolume > 0
      ? bar.dollarVolume
      : (bar.close > 0 ? bar.close * bar.volume : 0),
    lateCorrected: bar.lateCorrected,
  }));
}

export function computeParticipationForSymbol(opts: {
  symbol: string;
  tradingDate: string;
  eventNowMs: number;
  sessionKind: SessionKind;
  sessionVolume: number | null;
  bars: ReadonlyMap<number, SecondBar> | null | undefined;
  baselineCache: ParticipationBaselineCache | null;
  exceptions: CalendarExceptionRow[] | null;
  feedStale: boolean;
  volumeAccelerationPct: number | null;
  isoFromMs: (ms: number) => string | null;
  lastBarEndMs: number | null;
}): IntradayParticipationSnapshot {
  const parts = easternParts(opts.eventNowMs);
  const schedule = resolveScheduleAt(opts.eventNowMs, opts.exceptions);
  let baseline = null;
  if (
    opts.baselineCache &&
    parts &&
    schedule &&
    opts.sessionKind !== "closed"
  ) {
    baseline = opts.baselineCache.get(
      opts.symbol,
      opts.tradingDate,
      opts.sessionKind,
      parts.msOfDay,
    );
  }
  const calculatedAt = opts.isoFromMs(opts.eventNowMs);
  const sourceAsOf = opts.lastBarEndMs !== null
    ? opts.isoFromMs(opts.lastBarEndMs)
    : calculatedAt;
  return computeIntradayParticipation({
    bars: secondBarsToMinuteSlices(opts.bars),
    eventNowMs: opts.eventNowMs,
    cumulativeSessionVolume: opts.sessionVolume,
    baseline,
    feedStale: opts.feedStale,
    calculatedAtIso: calculatedAt,
    sourceAsOfIso: sourceAsOf,
    volumeAccelerationPct: opts.volumeAccelerationPct,
  });
}

export type { IntradayParticipationSnapshot };
