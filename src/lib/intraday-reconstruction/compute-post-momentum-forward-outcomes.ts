import {
  INTRADAY_FORWARD_CONTINUATION_MIN_MOVE_PCT,
  INTRADAY_FORWARD_OUTCOME_HORIZONS,
  type IntradayForwardAvailabilityState,
  type IntradayForwardOutcomeHorizon,
} from "@/config/intraday-forward-outcomes.config";
import type { NormalizedIntradayBar } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";

export interface PostMomentumForwardOutcomeWindow {
  horizon: IntradayForwardOutcomeHorizon;
  availabilityState: IntradayForwardAvailabilityState;
  referenceTimestamp: string | null;
  windowEndTimestamp: string | null;
  maxFavorablePct: number | null;
  maxAdversePct: number | null;
  endReturnPct: number | null;
  exceededReferenceHigh: boolean | null;
  continuation: boolean | null;
}

export type PostMomentumForwardOutcomesByHorizon = Partial<
  Record<IntradayForwardOutcomeHorizon, PostMomentumForwardOutcomeWindow>
>;

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from === 0 || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

function tsIso(ms: number): string {
  return new Date(ms).toISOString();
}

function favorablePct(direction: "POSITIVE" | "NEGATIVE" | "MIXED", ref: number, price: number): number | null {
  const raw = pctChange(ref, price);
  if (raw == null) return null;
  if (direction === "POSITIVE") return raw > 0 ? raw : 0;
  if (direction === "NEGATIVE") return raw < 0 ? Math.abs(raw) : 0;
  return Math.abs(raw);
}

function adversePct(direction: "POSITIVE" | "NEGATIVE" | "MIXED", ref: number, price: number): number | null {
  const raw = pctChange(ref, price);
  if (raw == null) return null;
  if (direction === "POSITIVE") return raw < 0 ? Math.abs(raw) : 0;
  if (direction === "NEGATIVE") return raw > 0 ? raw : 0;
  return Math.abs(raw);
}

function continuationFromEndReturn(
  direction: "POSITIVE" | "NEGATIVE" | "MIXED",
  endReturnPct: number | null,
): boolean | null {
  if (endReturnPct == null || !Number.isFinite(endReturnPct)) return null;
  const min = INTRADAY_FORWARD_CONTINUATION_MIN_MOVE_PCT;
  if (direction === "POSITIVE") return endReturnPct >= min;
  if (direction === "NEGATIVE") return endReturnPct <= -min;
  return Math.abs(endReturnPct) >= min;
}

function barsAfterReference(
  bars: readonly NormalizedIntradayBar[],
  referenceMs: number,
  windowEndMs: number,
): NormalizedIntradayBar[] {
  return bars.filter((bar) => bar.tsMs > referenceMs && bar.tsMs <= windowEndMs);
}

function computeWindow(input: {
  horizon: IntradayForwardOutcomeHorizon;
  direction: "POSITIVE" | "NEGATIVE" | "MIXED";
  referenceMs: number;
  referencePrice: number;
  referenceHigh: number | null;
  windowEndMs: number;
  sessionCloseMs: number;
  bars: readonly NormalizedIntradayBar[];
}): PostMomentumForwardOutcomeWindow {
  const base: PostMomentumForwardOutcomeWindow = {
    horizon: input.horizon,
    availabilityState: "INVALID_REFERENCE",
    referenceTimestamp: tsIso(input.referenceMs),
    windowEndTimestamp: tsIso(Math.min(input.windowEndMs, input.sessionCloseMs)),
    maxFavorablePct: null,
    maxAdversePct: null,
    endReturnPct: null,
    exceededReferenceHigh: null,
    continuation: null,
  };

  if (!Number.isFinite(input.referenceMs) || !Number.isFinite(input.referencePrice) || input.referencePrice <= 0) {
    return { ...base, availabilityState: "INVALID_REFERENCE" };
  }

  const effectiveEndMs = Math.min(input.windowEndMs, input.sessionCloseMs);
  const windowBars = barsAfterReference(input.bars, input.referenceMs, effectiveEndMs);
  if (windowBars.length === 0) {
    return { ...base, availabilityState: "INSUFFICIENT_BARS" };
  }

  let maxHigh = input.referencePrice;
  let minLow = input.referencePrice;
  let lastClose = input.referencePrice;
  for (const bar of windowBars) {
    if (bar.high > maxHigh) maxHigh = bar.high;
    if (bar.low < minLow) minLow = bar.low;
    lastClose = bar.close;
  }

  const maxFavorablePct = Math.max(
    favorablePct(input.direction, input.referencePrice, maxHigh) ?? 0,
    favorablePct(input.direction, input.referencePrice, minLow) ?? 0,
  );
  const maxAdversePct = Math.max(
    adversePct(input.direction, input.referencePrice, maxHigh) ?? 0,
    adversePct(input.direction, input.referencePrice, minLow) ?? 0,
  );

  const endReturnPct = pctChange(input.referencePrice, lastClose);
  const refHigh = input.referenceHigh ?? input.referencePrice;
  const exceededReferenceHigh = maxHigh > refHigh;

  const fullWindowObserved =
    input.horizon === "SESSION_CLOSE"
      ? effectiveEndMs >= input.sessionCloseMs
      : input.sessionCloseMs >= input.windowEndMs;
  const availabilityState: IntradayForwardAvailabilityState = fullWindowObserved
    ? "AVAILABLE"
    : "PARTIAL_WINDOW";

  return {
    ...base,
    availabilityState,
    maxFavorablePct: maxFavorablePct > 0 ? maxFavorablePct : 0,
    maxAdversePct: maxAdversePct > 0 ? maxAdversePct : 0,
    endReturnPct,
    exceededReferenceHigh,
    continuation: continuationFromEndReturn(input.direction, endReturnPct),
  };
}

/**
 * Observed forward paths after the momentum reference timestamp.
 * Uses only bars strictly after the reference time through each window end (no look-ahead).
 */
export function computePostMomentumForwardOutcomes(input: {
  direction: "POSITIVE" | "NEGATIVE" | "MIXED";
  referenceTimestampMs: number | null;
  referencePrice: number | null;
  referenceHigh: number | null;
  bars: readonly NormalizedIntradayBar[];
  sessionCloseMs: number | null;
}): PostMomentumForwardOutcomesByHorizon {
  const out: PostMomentumForwardOutcomesByHorizon = {};
  if (
    input.referenceTimestampMs == null
    || input.referencePrice == null
    || input.sessionCloseMs == null
    || !Number.isFinite(input.referenceTimestampMs)
    || !Number.isFinite(input.sessionCloseMs)
  ) {
    for (const horizon of INTRADAY_FORWARD_OUTCOME_HORIZONS) {
      out[horizon] = {
        horizon,
        availabilityState: "INVALID_REFERENCE",
        referenceTimestamp: input.referenceTimestampMs != null ? tsIso(input.referenceTimestampMs) : null,
        windowEndTimestamp: null,
        maxFavorablePct: null,
        maxAdversePct: null,
        endReturnPct: null,
        exceededReferenceHigh: null,
        continuation: null,
      };
    }
    return out;
  }

  const regBars = input.bars.filter((b) => b.segment === "REGULAR");
  const bars = regBars.length > 0 ? regBars : input.bars;

  for (const horizon of INTRADAY_FORWARD_OUTCOME_HORIZONS) {
    const windowEndMs =
      horizon === "SESSION_CLOSE"
        ? input.sessionCloseMs
        : input.referenceTimestampMs + horizon * 60_000;
    out[horizon] = computeWindow({
      horizon,
      direction: input.direction,
      referenceMs: input.referenceTimestampMs,
      referencePrice: input.referencePrice,
      referenceHigh: input.referenceHigh,
      windowEndMs,
      sessionCloseMs: input.sessionCloseMs,
      bars,
    });
  }
  return out;
}
