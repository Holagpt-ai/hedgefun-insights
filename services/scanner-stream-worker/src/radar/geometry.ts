/**
 * Sprint 3 in-memory sub-session intelligence.
 *
 * Attribution: Polygon/Massive A.* windows are [s, e). Session membership
 * uses bar START `s` via Radar half-open intervals. Never use `e`.
 *
 * Session VWAP = sessionDollarSum / sessionVolumeSum.
 * Dollar contribution: aggregate VWAP × volume when vw > 0, else close × volume.
 * Provider/day VWAP (Polygon `a`) is stored separately and is NOT this VWAP.
 *
 * HOD/LOD are monotonic scalars and survive six-minute RadarBook pruning.
 * Mid-session promotion sets geometryPartial/vwapPartial when the first
 * observed bar starts after the sub-session open.
 */
import type { CalendarExceptionRow, SessionKind } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import type { RadarV22Config } from "./config.ts";
import {
  isLiveSurveillanceKind,
  radarSessionKindAt,
  softTransitionOf,
  subsessionStartMsAt,
} from "./session.ts";
import type { AggregateSecondEvent, PriceWindow } from "./types.ts";

export type VwapSide = "above" | "below" | "unknown";
export type FreshnessClass = "fresh" | "active" | "cooling" | "stale" | "unknown";

export type FrozenSubsessionSummary = {
  sessionKind: SessionKind;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionVwap: number | null;
  sessionVolumeSum: number;
  sessionDollarSum: number;
  geometryPartial: boolean;
  vwapPartial: boolean;
};

export type SessionIntelSnapshot = {
  sessionKind: SessionKind;
  subsessionEpoch: number;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionVolumeSum: number;
  sessionDollarSum: number;
  sessionVwap: number | null;
  providerDayVwap: number | null;
  lastPrice: number | null;
  hodDistance: number | null;
  lastNewHodMs: number | null;
  lastHodAttemptMs: number | null;
  lastHodBreakMs: number | null;
  lastHodRejectMs: number | null;
  vwapSide: VwapSide;
  lastVwapCrossMs: number | null;
  lastVwapReclaimMs: number | null;
  lastVwapLossMs: number | null;
  lastVolumeBurstMs: number | null;
  lastPriceMoveMs: number | null;
  lastAccelerationMs: number | null;
  firstObservedBarStartMs: number | null;
  geometryPartial: boolean;
  vwapPartial: boolean;
  freshnessAgeMs: number | null;
  freshnessClass: FreshnessClass;
  frozenPrior: FrozenSubsessionSummary | null;
};

type RollingHints = {
  vol5s: number;
  vol15s: number;
  vol60s: number;
  move15s: PriceWindow;
  move60s: PriceWindow;
  acceleration5m: number | null;
};

type SymbolIntel = {
  sessionKind: SessionKind;
  subsessionEpoch: number;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionVolumeSum: number;
  sessionDollarSum: number;
  sessionVwap: number | null;
  providerDayVwap: number | null;
  lastPrice: number | null;
  lastNewHodMs: number | null;
  lastHodAttemptMs: number | null;
  lastHodBreakMs: number | null;
  lastHodRejectMs: number | null;
  hodBreakEmitted: boolean;
  rejectEmitted: boolean;
  lastAttemptOrBreakMs: number | null;
  vwapSide: VwapSide;
  lastVwapCrossMs: number | null;
  lastVwapReclaimMs: number | null;
  lastVwapLossMs: number | null;
  lastVolumeBurstMs: number | null;
  lastPriceMoveMs: number | null;
  lastAccelerationMs: number | null;
  firstObservedBarStartMs: number | null;
  geometryPartial: boolean;
  vwapPartial: boolean;
  frozenPrior: FrozenSubsessionSummary | null;
};

export function dollarContribution(event: AggregateSecondEvent): number {
  if (event.vw !== null && event.vw > 0) return event.vw * event.v;
  if (event.c !== null && event.c > 0) return event.c * event.v;
  return 0;
}

export function freshnessClassAt(
  ageMs: number | null,
  config: RadarV22Config,
): FreshnessClass {
  if (ageMs === null || !(ageMs >= 0)) return "unknown";
  if (ageMs <= config.freshnessFreshMs) return "fresh";
  if (ageMs <= config.freshnessActiveMs) return "active";
  if (ageMs <= config.freshnessCoolingMs) return "cooling";
  return "stale";
}

function latestMeaningfulMs(state: SymbolIntel): number | null {
  const clocks = [
    state.lastVolumeBurstMs,
    state.lastPriceMoveMs,
    state.lastNewHodMs,
    state.lastHodAttemptMs,
    state.lastVwapReclaimMs,
    state.lastVwapLossMs,
    state.lastAccelerationMs,
  ];
  let best: number | null = null;
  for (const t of clocks) {
    if (t === null) continue;
    if (best === null || t > best) best = t;
  }
  return best;
}

function freezeOf(state: SymbolIntel): FrozenSubsessionSummary {
  return {
    sessionKind: state.sessionKind,
    sessionHigh: state.sessionHigh,
    sessionLow: state.sessionLow,
    sessionVwap: state.sessionVwap,
    sessionVolumeSum: state.sessionVolumeSum,
    sessionDollarSum: state.sessionDollarSum,
    geometryPartial: state.geometryPartial,
    vwapPartial: state.vwapPartial,
  };
}

function emptyState(
  sessionKind: SessionKind,
  subsessionEpoch: number,
  frozenPrior: FrozenSubsessionSummary | null,
): SymbolIntel {
  return {
    sessionKind,
    subsessionEpoch,
    sessionHigh: null,
    sessionLow: null,
    sessionVolumeSum: 0,
    sessionDollarSum: 0,
    sessionVwap: null,
    providerDayVwap: null,
    lastPrice: null,
    lastNewHodMs: null,
    lastHodAttemptMs: null,
    lastHodBreakMs: null,
    lastHodRejectMs: null,
    hodBreakEmitted: false,
    rejectEmitted: false,
    lastAttemptOrBreakMs: null,
    vwapSide: "unknown",
    lastVwapCrossMs: null,
    lastVwapReclaimMs: null,
    lastVwapLossMs: null,
    lastVolumeBurstMs: null,
    lastPriceMoveMs: null,
    lastAccelerationMs: null,
    firstObservedBarStartMs: null,
    geometryPartial: false,
    vwapPartial: false,
    frozenPrior,
  };
}

function snapshotOf(
  state: SymbolIntel,
  eventNowMs: number,
  config: RadarV22Config,
): SessionIntelSnapshot {
  const latest = latestMeaningfulMs(state);
  const freshnessAgeMs = latest === null ? null : eventNowMs - latest;
  const hodDistance =
    state.sessionHigh !== null && state.sessionHigh > 0 &&
      state.lastPrice !== null
      ? (state.sessionHigh - state.lastPrice) / state.sessionHigh
      : null;
  return {
    sessionKind: state.sessionKind,
    subsessionEpoch: state.subsessionEpoch,
    sessionHigh: state.sessionHigh,
    sessionLow: state.sessionLow,
    sessionVolumeSum: state.sessionVolumeSum,
    sessionDollarSum: state.sessionDollarSum,
    sessionVwap: state.sessionVwap,
    providerDayVwap: state.providerDayVwap,
    lastPrice: state.lastPrice,
    hodDistance,
    lastNewHodMs: state.lastNewHodMs,
    lastHodAttemptMs: state.lastHodAttemptMs,
    lastHodBreakMs: state.lastHodBreakMs,
    lastHodRejectMs: state.lastHodRejectMs,
    vwapSide: state.vwapSide,
    lastVwapCrossMs: state.lastVwapCrossMs,
    lastVwapReclaimMs: state.lastVwapReclaimMs,
    lastVwapLossMs: state.lastVwapLossMs,
    lastVolumeBurstMs: state.lastVolumeBurstMs,
    lastPriceMoveMs: state.lastPriceMoveMs,
    lastAccelerationMs: state.lastAccelerationMs,
    firstObservedBarStartMs: state.firstObservedBarStartMs,
    geometryPartial: state.geometryPartial,
    vwapPartial: state.vwapPartial,
    freshnessAgeMs,
    freshnessClass: freshnessClassAt(freshnessAgeMs, config),
    frozenPrior: state.frozenPrior === null ? null : { ...state.frozenPrior },
  };
}

function applyFreshness(
  state: SymbolIntel,
  eventMs: number,
  hints: RollingHints,
  config: RadarV22Config,
): void {
  if (
    hints.vol5s >= config.detectVol5s || hints.vol15s >= config.detectVol15s
  ) {
    state.lastVolumeBurstMs = eventMs;
  }
  const move15 = hints.move15s.complete && hints.move15s.movePct !== null &&
    Math.abs(hints.move15s.movePct) >= config.activeMove15sPct;
  const move60 = hints.move60s.complete && hints.move60s.movePct !== null &&
    Math.abs(hints.move60s.movePct) >= config.activeMove60sPct;
  if (move15 || move60) state.lastPriceMoveMs = eventMs;
  if (
    hints.acceleration5m !== null &&
    hints.acceleration5m >= config.freshnessAccelThreshold
  ) {
    state.lastAccelerationMs = eventMs;
  }
}

function applyBarToState(
  state: SymbolIntel,
  event: AggregateSecondEvent,
  hints: RollingHints | null,
  config: RadarV22Config,
  exceptions: CalendarExceptionRow[] | null,
): void {
  const startMs = event.s;
  if (state.firstObservedBarStartMs === null) {
    state.firstObservedBarStartMs = startMs;
    const openMs = subsessionStartMsAt(startMs, exceptions);
    const partial = openMs !== null && startMs > openMs;
    state.geometryPartial = partial;
    state.vwapPartial = partial;
  }

  const dollars = dollarContribution(event);
  state.sessionVolumeSum += event.v;
  state.sessionDollarSum += dollars;
  state.sessionVwap = state.sessionVolumeSum > 0
    ? state.sessionDollarSum / state.sessionVolumeSum
    : null;
  if (event.a !== null && event.a > 0) state.providerDayVwap = event.a;

  const priceComplete = event.o !== null && event.h !== null &&
    event.l !== null && event.c !== null;
  if (priceComplete && event.c !== null) state.lastPrice = event.c;

  if (priceComplete && event.l !== null) {
    state.sessionLow = state.sessionLow === null
      ? event.l
      : Math.min(state.sessionLow, event.l);
  }

  if (priceComplete && event.h !== null && event.h > 0) {
    if (state.sessionHigh === null) {
      state.sessionHigh = event.h;
      state.lastNewHodMs = startMs;
    } else if (event.h > state.sessionHigh) {
      const previousHod = state.sessionHigh;
      state.sessionHigh = event.h;
      state.lastNewHodMs = startMs;
      state.rejectEmitted = false;
      state.lastAttemptOrBreakMs = startMs;
      if (
        !state.hodBreakEmitted &&
        event.c !== null &&
        event.c > previousHod
      ) {
        state.lastHodBreakMs = startMs;
        state.hodBreakEmitted = true;
      }
    } else {
      const band = state.sessionHigh * config.hodAttemptProximityPct;
      const near = event.h >= state.sessionHigh - band ||
        (event.c !== null && event.c >= state.sessionHigh - band);
      const volOk = hints !== null &&
        (hints.vol5s >= config.detectVol5s ||
          hints.vol15s >= config.detectVol15s);
      if (near && volOk) {
        state.lastHodAttemptMs = startMs;
        state.lastAttemptOrBreakMs = startMs;
        state.rejectEmitted = false;
      }
    }
  }

  if (
    !state.rejectEmitted &&
    state.lastAttemptOrBreakMs !== null &&
    state.sessionHigh !== null &&
    event.c !== null && priceComplete
  ) {
    const within = startMs - state.lastAttemptOrBreakMs <=
      config.hodRejectWindowMs;
    const fallen = event.c <=
      state.sessionHigh * (1 - config.hodRejectDistancePct);
    if (within && fallen) {
      state.lastHodRejectMs = startMs;
      state.rejectEmitted = true;
    }
  }

  if (
    priceComplete && event.c !== null && state.sessionVwap !== null &&
    state.sessionVwap > 0
  ) {
    const side: VwapSide = event.c > state.sessionVwap
      ? "above"
      : event.c < state.sessionVwap
      ? "below"
      : state.vwapSide;
    if (side !== "unknown" && side !== state.vwapSide) {
      if (state.vwapSide === "below" && side === "above") {
        state.lastVwapReclaimMs = startMs;
        state.lastVwapCrossMs = startMs;
      } else if (state.vwapSide === "above" && side === "below") {
        state.lastVwapLossMs = startMs;
        state.lastVwapCrossMs = startMs;
      } else if (state.vwapSide === "unknown") {
        // first observation establishes side; not a cross
      }
      state.vwapSide = side;
    }
  }

  if (hints !== null) applyFreshness(state, startMs, hints, config);
}

export type SessionIntelBook = {
  applyEvent(
    event: AggregateSecondEvent,
    opts: {
      currentKind: SessionKind | null;
      subsessionEpoch: number;
      exceptions: CalendarExceptionRow[] | null;
      hints: RollingHints | null;
    },
  ): void;
  applyFreshnessHints(
    symbol: string,
    eventMs: number,
    hints: RollingHints,
  ): void;
  softResetAll(nextKind: SessionKind, nextEpoch: number): void;
  clear(): void;
  drop(symbol: string): void;
  get(symbol: string, eventNowMs: number): SessionIntelSnapshot | null;
};

export function createSessionIntelBook(config: RadarV22Config): SessionIntelBook {
  const states = new Map<string, SymbolIntel>();

  return {
    applyEvent(event, opts) {
      const barKind = radarSessionKindAt(event.s, opts.exceptions);
      if (!isLiveSurveillanceKind(barKind)) return;
      let state = states.get(event.sym);
      if (
        opts.currentKind !== null &&
        isLiveSurveillanceKind(opts.currentKind) &&
        barKind !== opts.currentKind
      ) {
        if (!softTransitionOf(opts.currentKind, barKind)) return;
        if (state && state.sessionKind === opts.currentKind) {
          state = emptyState(
            barKind,
            opts.subsessionEpoch + 1,
            freezeOf(state),
          );
          states.set(event.sym, state);
        }
      }
      if (!state) {
        state = emptyState(barKind, opts.subsessionEpoch, null);
        states.set(event.sym, state);
      }
      if (state.sessionKind !== barKind) return;
      applyBarToState(state, event, opts.hints, config, opts.exceptions);
    },

    applyFreshnessHints(symbol, eventMs, hints) {
      const state = states.get(symbol);
      if (!state) return;
      applyFreshness(state, eventMs, hints, config);
    },

    softResetAll(nextKind, nextEpoch) {
      for (const [symbol, state] of states) {
        if (state.sessionKind === nextKind) {
          state.subsessionEpoch = nextEpoch;
          continue;
        }
        states.set(symbol, emptyState(nextKind, nextEpoch, freezeOf(state)));
      }
    },

    clear() {
      states.clear();
    },

    drop(symbol) {
      states.delete(symbol);
    },

    get(symbol, eventNowMs) {
      const state = states.get(symbol);
      if (!state) return null;
      return snapshotOf(state, eventNowMs, config);
    },
  };
}
