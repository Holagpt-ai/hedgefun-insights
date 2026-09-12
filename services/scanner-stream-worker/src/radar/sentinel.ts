import type { RadarV22Config } from "./config.ts";
import { effectivePromotionCap } from "./config.ts";
import type {
  AggregateSecondEvent,
  IngestResult,
  PromotionDecision,
  PromotionReason,
  SentinelMetrics,
} from "./types.ts";

const RING = 60;
const WINDOW_5 = 5;
const WINDOW_15 = 15;

type SentinelSymbol = {
  symbol: string;
  lastStartMs: number;
  lastEndMs: number;
  lastVolume: number;
  lastClose: number | null;
  lastDollarVolume: number;
  sessionAv: number | null;
  lastSeenMs: number;
  firstSecond: number;
  dirty: boolean;
  vol: Float64Array;
  dollar: Float64Array;
  head: number;
  cursorSecond: number;
};

function typicalPrice(event: AggregateSecondEvent): number | null {
  if (event.vw !== null && event.vw > 0) return event.vw;
  if (event.c !== null && event.c > 0) return event.c;
  return null;
}

function dollarOf(event: AggregateSecondEvent): number {
  const px = typicalPrice(event);
  return px !== null ? px * event.v : 0;
}

function emptySymbol(event: AggregateSecondEvent, receiveMs: number): SentinelSymbol {
  const sec = Math.trunc(event.s / 1000);
  const vol = new Float64Array(RING);
  const dollar = new Float64Array(RING);
  vol[0] = event.v;
  dollar[0] = dollarOf(event);
  return {
    symbol: event.sym,
    lastStartMs: event.s,
    lastEndMs: event.e,
    lastVolume: event.v,
    lastClose: event.c,
    lastDollarVolume: dollarOf(event),
    sessionAv: event.av,
    lastSeenMs: receiveMs,
    firstSecond: sec,
    dirty: true,
    vol,
    dollar,
    head: 0,
    cursorSecond: sec,
  };
}

function rotateTo(state: SentinelSymbol, newSecond: number): void {
  const delta = newSecond - state.cursorSecond;
  if (delta <= 0) return;
  if (delta >= RING) {
    state.vol.fill(0);
    state.dollar.fill(0);
    state.head = 0;
  } else {
    for (let i = 0; i < delta; i++) {
      state.head = (state.head + 1) % RING;
      state.vol[state.head] = 0;
      state.dollar[state.head] = 0;
    }
  }
  state.cursorSecond = newSecond;
}

function slotFor(state: SentinelSymbol, second: number): number | null {
  const age = state.cursorSecond - second;
  if (age < 0 || age >= RING) return null;
  return (state.head - age + RING) % RING;
}

function sumLast(
  state: SentinelSymbol,
  n: number,
): { vol: number; dollar: number } {
  let vol = 0;
  let dollar = 0;
  const count = Math.min(n, RING);
  for (let age = 0; age < count; age++) {
    const idx = (state.head - age + RING) % RING;
    vol += state.vol[idx];
    dollar += state.dollar[idx];
  }
  return { vol, dollar };
}

function sumAgeRange(
  state: SentinelSymbol,
  fromAge: number,
  toAgeExclusive: number,
): number {
  let vol = 0;
  const start = Math.max(0, fromAge);
  const end = Math.min(RING, toAgeExclusive);
  for (let age = start; age < end; age++) {
    const idx = (state.head - age + RING) % RING;
    vol += state.vol[idx];
  }
  return vol;
}

function observedSeconds(state: SentinelSymbol): number {
  return Math.min(RING, state.cursorSecond - state.firstSecond + 1);
}

function applyEvent(
  state: SentinelSymbol,
  event: AggregateSecondEvent,
  receiveMs: number,
  lateCorrectionMs: number,
): IngestResult {
  const sec = Math.trunc(event.s / 1000);
  const dollars = dollarOf(event);
  let kind: "new" | "duplicate" | "correction" | "late_correction" | "out_of_order" =
    "new";

  if (sec === state.cursorSecond) {
    const idx = state.head;
    if (state.vol[idx] === event.v && state.dollar[idx] === dollars) {
      kind = "duplicate";
    } else {
      kind = receiveMs - state.lastEndMs > lateCorrectionMs
        ? "late_correction"
        : "correction";
      state.vol[idx] = event.v;
      state.dollar[idx] = dollars;
    }
  } else if (sec > state.cursorSecond) {
    rotateTo(state, sec);
    state.vol[state.head] = event.v;
    state.dollar[state.head] = dollars;
  } else {
    const slot = slotFor(state, sec);
    kind = "out_of_order";
    if (slot !== null) {
      if (state.vol[slot] === event.v && state.dollar[slot] === dollars) {
        kind = "duplicate";
      } else {
        state.vol[slot] = event.v;
        state.dollar[slot] = dollars;
      }
    }
  }

  if (kind !== "duplicate") {
    if (sec >= state.cursorSecond || event.s >= state.lastStartMs) {
      state.lastStartMs = event.s;
      state.lastEndMs = event.e;
      state.lastVolume = event.v;
      state.lastClose = event.c;
      state.lastDollarVolume = dollars;
      if (event.av !== null) state.sessionAv = event.av;
    }
  }
  state.lastSeenMs = receiveMs;
  state.dirty = true;
  return {
    accepted: true,
    kind,
    symbol: event.sym,
    startMs: event.s,
    endMs: event.e,
  };
}

export function metricsFromState(state: SentinelSymbol): SentinelMetrics {
  const vol5 = sumLast(state, WINDOW_5);
  const vol15 = sumLast(state, WINDOW_15);
  const vol60 = sumLast(state, RING);
  const observed = observedSeconds(state);
  const precedingSeconds5 = Math.min(
    RING - WINDOW_5,
    Math.max(0, observed - WINDOW_5),
  );
  const precedingSeconds15 = Math.min(
    RING - WINDOW_15,
    Math.max(0, observed - WINDOW_15),
  );
  const precedingVol5 = sumAgeRange(state, WINDOW_5, WINDOW_5 + precedingSeconds5);
  const precedingVol15 = sumAgeRange(
    state,
    WINDOW_15,
    WINDOW_15 + precedingSeconds15,
  );
  const expected5 = precedingSeconds5 > 0
    ? precedingVol5 * WINDOW_5 / precedingSeconds5
    : null;
  const expected15 = precedingSeconds15 > 0
    ? precedingVol15 * WINDOW_15 / precedingSeconds15
    : null;
  const sessionVolume = state.sessionAv !== null && state.sessionAv > 0
    ? state.sessionAv
    : vol60.vol;

  return {
    symbol: state.symbol,
    lastStartMs: state.lastStartMs,
    lastEndMs: state.lastEndMs,
    lastVolume: state.lastVolume,
    lastClose: state.lastClose,
    lastDollarVolume: state.lastDollarVolume,
    vol5s: vol5.vol,
    vol15s: vol15.vol,
    vol60s: vol60.vol,
    dollarVol5s: vol5.dollar,
    dollarVol15s: vol15.dollar,
    dollarVol60s: vol60.dollar,
    sessionVolume,
    lastSeenMs: state.lastSeenMs,
    observedSeconds: observed,
    precedingVol5Baseline: precedingVol5,
    precedingSeconds5,
    expected5,
    precedingVol15Baseline: precedingVol15,
    precedingSeconds15,
    expected15,
  };
}

/**
 * Volume-first, direction-neutral promotion.
 *
 * Liquidity safeguards (NOT a $2–$20 product band):
 * - lastClose must be > 0 (a tradable print exists).
 * - Absolute 5s/15s paths require modest dollar floors so sub-cent dust
 *   with large share counts does not promote.
 * - Absolute 60s detect combo is share-based only (existing Radar floors).
 * - Relative bursts use lower dollar floors so a quiet low-priced name that
 *   suddenly prints size can still promote.
 * Price direction is never consulted.
 */
export function evaluatePromotion(
  metrics: SentinelMetrics,
  config: RadarV22Config,
): PromotionDecision {
  const close = metrics.lastClose;
  if (close === null || !(close > 0)) {
    return { promote: false, reason: null };
  }

  const abs60 = metrics.vol60s >= config.detectVol60sFloor &&
    (metrics.vol5s >= config.detectVol5s ||
      metrics.vol15s >= config.detectVol15s);
  if (abs60) return { promote: true, reason: "absolute_60s" };

  if (
    metrics.vol5s >= config.detectVol5s &&
    metrics.dollarVol5s >= config.sentinelAbsoluteMinDollar5s
  ) {
    return { promote: true, reason: "absolute_5s" };
  }

  if (
    metrics.vol15s >= config.detectVol15s &&
    metrics.dollarVol15s >= config.sentinelAbsoluteMinDollar15s
  ) {
    return { promote: true, reason: "absolute_15s" };
  }

  const burst5Ready =
    metrics.precedingSeconds5 >= config.sentinelBurst5MinPrecedingSeconds;
  if (burst5Ready && metrics.vol5s >= config.sentinelBurst5MinShares) {
    const expected = metrics.expected5;
    const multipleOk = expected !== null && expected > 0
      ? metrics.vol5s >= expected * config.sentinelBurst5Multiple
      : metrics.vol5s >= config.sentinelBurst5MinShares;
    if (multipleOk && metrics.dollarVol5s >= config.sentinelBurstMinDollar5s) {
      return { promote: true, reason: "burst_5s" };
    }
  }

  const burst15Ready =
    metrics.precedingSeconds15 >= config.sentinelBurst15MinPrecedingSeconds;
  if (burst15Ready && metrics.vol15s >= config.sentinelBurst15MinShares) {
    const expected = metrics.expected15;
    const multipleOk = expected !== null && expected > 0
      ? metrics.vol15s >= expected * config.sentinelBurst15Multiple
      : metrics.vol15s >= config.sentinelBurst15MinShares;
    if (
      multipleOk && metrics.dollarVol15s >= config.sentinelBurstMinDollar15s
    ) {
      return { promote: true, reason: "burst_15s" };
    }
  }

  return { promote: false, reason: null };
}

export type MarketSentinel = {
  ingestEvent(event: AggregateSecondEvent, receiveMs: number): IngestResult;
  metrics(symbol: string): SentinelMetrics | null;
  evict(
    eventNowMs: number,
    ttlMs: number,
    keep?: ReadonlySet<string>,
  ): number;
  takeDirty(): string[];
  has(symbol: string): boolean;
  liveCount(): number;
  clear(): void;
  symbols(): string[];
};

export function createMarketSentinel(
  config: Pick<RadarV22Config, "lateCorrectionMs"> = { lateCorrectionMs: 10_000 },
): MarketSentinel {
  const states = new Map<string, SentinelSymbol>();
  const lateMs = config.lateCorrectionMs;

  return {
    ingestEvent(event, receiveMs): IngestResult {
      let state = states.get(event.sym);
      if (!state) {
        state = emptySymbol(event, receiveMs);
        states.set(event.sym, state);
        return {
          accepted: true,
          kind: "new",
          symbol: event.sym,
          startMs: event.s,
          endMs: event.e,
        };
      }
      return applyEvent(state, event, receiveMs, lateMs);
    },
    metrics(symbol) {
      const state = states.get(symbol);
      return state ? metricsFromState(state) : null;
    },
    evict(eventNowMs, ttlMs, keep?: ReadonlySet<string>) {
      let removed = 0;
      for (const [symbol, state] of states) {
        if (keep?.has(symbol)) continue;
        // Market-state age: provider/event chronology, not wall or receive.
        if (eventNowMs - state.lastEndMs >= ttlMs) {
          states.delete(symbol);
          removed += 1;
        }
      }
      return removed;
    },
    takeDirty() {
      const dirty: string[] = [];
      for (const [symbol, state] of states) {
        if (state.dirty) {
          dirty.push(symbol);
          state.dirty = false;
        }
      }
      return dirty;
    },
    has(symbol) {
      return states.has(symbol);
    },
    liveCount() {
      return states.size;
    },
    clear() {
      states.clear();
    },
    symbols() {
      return [...states.keys()];
    },
  };
}

export function promotionCapOf(config: RadarV22Config): number {
  return effectivePromotionCap(config);
}
