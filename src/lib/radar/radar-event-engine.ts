/**
 * Radar Event Engine V1 — deterministic per-symbol events + lifecycle.
 *
 * Shared by the Fly worker (via radar-event-book), trigger-time handoff,
 * promotion explanation, and AI context. One engine; multiple consumers.
 *
 * Lifecycle transition rules (evaluated once per worker tick per symbol):
 *
 * 1. IDLE → BUILDING when detect OR sessionVolume ≥ buildingMinSessionVolume.
 * 2. BUILDING → MOMENTUM when active AND move15s complete AND move15s > 0
 *    (fires MOMENTUM_TRIGGER on first entry to MOMENTUM per session).
 * 3. MOMENTUM → PULLBACK when move15s complete AND move15s < pullbackMove15Pct
 *    OR vol15s < pullbackVolFraction × peakVol15InMomentum
 *    (fires PULLBACK once per pullback episode).
 * 4. PULLBACK → RE_ACCELERATING when active AND move15s complete AND move15s > 0
 *    (fires RE_ACCELERATION; requires prior pullback/cooling — enforced by phase).
 * 5. RE_ACCELERATING → SECOND_LEG when consecutiveActiveInReaccel ≥ 2 while active
 *    (fires SECOND_LEG once per leg; requires momentumLegConfirmed + hadPullbackSinceLeg).
 * 6. MOMENTUM → COOLING when vol60s < coolingVol60Ceiling for coolingEvals consecutive ticks.
 * 7. COOLING → RE_ACCELERATING on same rule as (4).
 * 8. surveillanceDate change → reset to IDLE (no cross-session state).
 *
 * Volume thresholds VOLUME_100K / 500K / 1M fire once each on first verified cross.
 * NEW_HOD fires when session high increases by ≥ minHodIncrement vs last emitted HOD.
 * VWAP_RECLAIM / VWAP_LOSS fire only on below↔above transitions (not every tick).
 */

export const RADAR_EVENT_ENGINE_VERSION = "v1" as const;

export const RADAR_EVENT_ENGINE_ACTIVE_TYPES = [
  "VOLUME_100K",
  "VOLUME_500K",
  "VOLUME_1M",
  "MOMENTUM_TRIGGER",
  "RE_ACCELERATION",
  "PULLBACK",
  "SECOND_LEG",
  "NEW_HOD",
  "VWAP_RECLAIM",
  "VWAP_LOSS",
] as const;

export type RadarEventEngineActiveType =
  (typeof RADAR_EVENT_ENGINE_ACTIVE_TYPES)[number];

/** Reserved — no inference until a verified halt feed exists. */
export const RADAR_EVENT_ENGINE_RESERVED_TYPES = ["HALT", "RESUME"] as const;
export type RadarEventEngineReservedType =
  (typeof RADAR_EVENT_ENGINE_RESERVED_TYPES)[number];

export type RadarEventEngineType =
  | RadarEventEngineActiveType
  | RadarEventEngineReservedType;

export const RADAR_EVENT_LIFECYCLE_PHASES = [
  "IDLE",
  "BUILDING",
  "MOMENTUM",
  "PULLBACK",
  "RE_ACCELERATING",
  "SECOND_LEG",
  "COOLING",
] as const;

export type RadarEventLifecyclePhase =
  (typeof RADAR_EVENT_LIFECYCLE_PHASES)[number];

export const VOLUME_THRESHOLD_EVENTS = [
  { type: "VOLUME_100K" as const, threshold: 100_000 },
  { type: "VOLUME_500K" as const, threshold: 500_000 },
  { type: "VOLUME_1M" as const, threshold: 1_000_000 },
];

export type RadarEventEvidence = {
  symbol: string;
  tradingDate: string;
  eventType: RadarEventEngineActiveType;
  eventAt: string | null;
  observedPrice: number | null;
  cumulativeVolume: number | null;
  volume5s: number | null;
  volume15s: number | null;
  volume60s: number | null;
  volumeAccelerationPct: number | null;
  priceChangeShortWindowPct: number | null;
  hod: number | null;
  vwap: number | null;
  priceVsHodPct: number | null;
  priceVsVwapPct: number | null;
  freshnessAgeMs: number | null;
  lifecyclePhase: RadarEventLifecyclePhase;
  source: string;
  time_adjusted_rvol?: number | null;
  volume_5m?: number | null;
  volume_15m?: number | null;
  volume_60m?: number | null;
  volume_velocity_5m?: number | null;
  volume_velocity_15m?: number | null;
  volume_velocity_60m?: number | null;
  dollar_volume_velocity_5m?: number | null;
  participation_state?: string | null;
  participation_baseline_session_count?: number | null;
};

export type RadarEventEngineRecord = {
  type: RadarEventEngineActiveType;
  eventAt: string;
  evidence: RadarEventEvidence;
};

export type PromotionReason = {
  version: typeof RADAR_EVENT_ENGINE_VERSION;
  primaryEvent: { type: RadarEventEngineActiveType; eventAt: string } | null;
  supportingEvents: Array<{ type: RadarEventEngineActiveType; eventAt: string }>;
  triggerTimestamp: string | null;
  evidenceSnapshot: RadarEventEvidence | null;
};

export type RadarEventEngineConfig = {
  buildingMinSessionVolume: number;
  pullbackMove15Pct: number;
  pullbackVolFraction: number;
  coolingVol60Ceiling: number;
  coolingEvals: number;
  reaccelConfirmEvals: number;
  minHodIncrement: number;
  maxSupportingEvents: number;
  maxPersistedEvents: number;
};

export const DEFAULT_RADAR_EVENT_ENGINE_CONFIG: RadarEventEngineConfig = {
  buildingMinSessionVolume: 25_000,
  pullbackMove15Pct: -0.1,
  pullbackVolFraction: 0.5,
  coolingVol60Ceiling: 20_000,
  coolingEvals: 3,
  reaccelConfirmEvals: 2,
  minHodIncrement: 0.0001,
  maxSupportingEvents: 5,
  maxPersistedEvents: 32,
};

export type RadarEventEngineSymbolState = {
  surveillanceDate: string;
  phase: RadarEventLifecyclePhase;
  volumeFired: Record<string, true>;
  lastEmittedHod: number | null;
  prevVwapSide: "above" | "below" | "unknown";
  momentumLegConfirmed: boolean;
  hadPullbackSinceLeg: boolean;
  peakVol15InMomentum: number;
  consecutiveActiveInReaccel: number;
  consecutiveLowVol60: number;
  pullbackEpisodeOpen: boolean;
  secondLegEmitted: boolean;
  records: RadarEventEngineRecord[];
};

export type RadarEventEngineStepInput = {
  symbol: string;
  surveillanceDate: string;
  eventNowMs: number;
  /** When false, lifecycle may update but no new events are emitted. */
  emitEvents: boolean;
  detect: boolean;
  active: boolean;
  sessionVolume: number | null;
  lastPrice: number | null;
  vol5s: number | null;
  vol15s: number | null;
  vol60s: number | null;
  volumeAccelerationPct: number | null;
  move15sPct: number | null;
  move15Complete: boolean;
  sessionHigh: number | null;
  sessionVwap: number | null;
  vwapSide: "above" | "below" | "unknown";
  distanceFromHodPct: number | null;
  freshnessAgeMs: number | null;
  participation?: {
    time_adjusted_rvol: number | null;
    volume_5m: number | null;
    volume_15m: number | null;
    volume_60m: number | null;
    volume_velocity_5m: number | null;
    volume_velocity_15m: number | null;
    volume_velocity_60m: number | null;
    dollar_volume_velocity_5m: number | null;
    participation_state: string | null;
    participation_baseline_session_count: number | null;
  } | null;
  isoFromMs: (ms: number) => string | null;
  source?: string;
};

export type RadarEventEngineStepResult = {
  state: RadarEventEngineSymbolState;
  lifecycle: RadarEventLifecyclePhase;
  newEvents: RadarEventEngineRecord[];
  promotionReason: PromotionReason;
  persistableEvents: Array<{ type: RadarEventEngineActiveType; eventAt: string }>;
};

export function emptyRadarEventEngineState(
  surveillanceDate: string,
): RadarEventEngineSymbolState {
  return {
    surveillanceDate,
    phase: "IDLE",
    volumeFired: {},
    lastEmittedHod: null,
    prevVwapSide: "unknown",
    momentumLegConfirmed: false,
    hadPullbackSinceLeg: false,
    peakVol15InMomentum: 0,
    consecutiveActiveInReaccel: 0,
    consecutiveLowVol60: 0,
    pullbackEpisodeOpen: false,
    secondLegEmitted: false,
    records: [],
  };
}

function finite(n: number | null | undefined): n is number {
  return n !== null && n !== undefined && Number.isFinite(n);
}

function buildEvidence(
  input: RadarEventEngineStepInput,
  eventType: RadarEventEngineActiveType,
  eventAt: string,
  phase: RadarEventLifecyclePhase,
  source: string,
): RadarEventEvidence {
  const price = input.lastPrice;
  const hod = input.sessionHigh;
  const vwap = input.sessionVwap;
  let priceVsHodPct: number | null = input.distanceFromHodPct;
  if (priceVsHodPct === null && finite(price) && finite(hod) && hod > 0) {
    priceVsHodPct = ((hod - price) / hod) * 100;
  }
  let priceVsVwapPct: number | null = null;
  if (finite(price) && finite(vwap) && vwap > 0) {
    priceVsVwapPct = ((price - vwap) / vwap) * 100;
  }
  return {
    symbol: input.symbol,
    tradingDate: input.surveillanceDate,
    eventType,
    eventAt,
    observedPrice: price,
    cumulativeVolume: input.sessionVolume,
    volume5s: input.vol5s,
    volume15s: input.vol15s,
    volume60s: input.vol60s,
    volumeAccelerationPct: input.volumeAccelerationPct,
    priceChangeShortWindowPct: input.move15Complete ? input.move15sPct : null,
    hod,
    vwap,
    priceVsHodPct,
    priceVsVwapPct,
    freshnessAgeMs: input.freshnessAgeMs,
    lifecyclePhase: phase,
    source,
    time_adjusted_rvol: input.participation?.time_adjusted_rvol ?? null,
    volume_5m: input.participation?.volume_5m ?? null,
    volume_15m: input.participation?.volume_15m ?? null,
    volume_60m: input.participation?.volume_60m ?? null,
    volume_velocity_5m: input.participation?.volume_velocity_5m ?? null,
    volume_velocity_15m: input.participation?.volume_velocity_15m ?? null,
    volume_velocity_60m: input.participation?.volume_velocity_60m ?? null,
    dollar_volume_velocity_5m: input.participation?.dollar_volume_velocity_5m ?? null,
    participation_state: input.participation?.participation_state ?? null,
    participation_baseline_session_count:
      input.participation?.participation_baseline_session_count ?? null,
  };
}

function pushRecord(
  state: RadarEventEngineSymbolState,
  record: RadarEventEngineRecord,
  cfg: RadarEventEngineConfig,
): void {
  const exists = state.records.some(
    (r) => r.type === record.type && r.eventAt === record.eventAt,
  );
  if (exists) return;
  state.records.push(record);
  if (state.records.length > cfg.maxPersistedEvents) {
    state.records.splice(0, state.records.length - cfg.maxPersistedEvents);
  }
}

function pickPrimary(
  records: RadarEventEngineRecord[],
): RadarEventEngineRecord | null {
  const priority: RadarEventEngineActiveType[] = [
    "MOMENTUM_TRIGGER",
    "SECOND_LEG",
    "RE_ACCELERATION",
    "VOLUME_1M",
    "VOLUME_500K",
    "VOLUME_100K",
    "NEW_HOD",
    "VWAP_RECLAIM",
    "PULLBACK",
    "VWAP_LOSS",
  ];
  for (const p of priority) {
    const hit = records.find((r) => r.type === p);
    if (hit) return hit;
  }
  return records.length > 0 ? records[records.length - 1]! : null;
}

export function buildPromotionReason(
  records: RadarEventEngineRecord[],
  cfg: RadarEventEngineConfig = DEFAULT_RADAR_EVENT_ENGINE_CONFIG,
): PromotionReason {
  const primary = pickPrimary(records);
  const supporting = records
    .filter((r) => r.type !== primary?.type)
    .slice(-cfg.maxSupportingEvents)
    .map((r) => ({ type: r.type, eventAt: r.eventAt }));
  return {
    version: RADAR_EVENT_ENGINE_VERSION,
    primaryEvent: primary
      ? { type: primary.type, eventAt: primary.eventAt }
      : null,
    supportingEvents: supporting,
    triggerTimestamp: primary?.eventAt ?? null,
    evidenceSnapshot: primary?.evidence ?? null,
  };
}

export function stepRadarEventEngine(
  prev: RadarEventEngineSymbolState | null,
  input: RadarEventEngineStepInput,
  cfg: RadarEventEngineConfig = DEFAULT_RADAR_EVENT_ENGINE_CONFIG,
): RadarEventEngineStepResult {
  let state = prev?.surveillanceDate === input.surveillanceDate
    ? { ...prev, records: [...prev.records] }
    : emptyRadarEventEngineState(input.surveillanceDate);

  const source = input.source?.trim() || "radar_event_engine_v1";
  const newEvents: RadarEventEngineRecord[] = [];

  const emit = (type: RadarEventEngineActiveType): void => {
    if (!input.emitEvents) return;
    const iso = input.isoFromMs(input.eventNowMs);
    if (!iso) return;
    const evidence = buildEvidence(input, type, iso, state.phase, source);
    const record: RadarEventEngineRecord = { type, eventAt: iso, evidence };
    pushRecord(state, record, cfg);
    newEvents.push(record);
  };

  // ── Volume thresholds (once per session) ──
  if (finite(input.sessionVolume)) {
    for (const item of VOLUME_THRESHOLD_EVENTS) {
      if (input.sessionVolume < item.threshold) continue;
      if (state.volumeFired[item.type]) continue;
      state.volumeFired[item.type] = true;
      emit(item.type);
    }
  }

  // ── NEW_HOD ──
  if (finite(input.sessionHigh)) {
    const prevHod = state.lastEmittedHod;
    if (prevHod === null) {
      state.lastEmittedHod = input.sessionHigh;
    } else if (input.sessionHigh >= prevHod + cfg.minHodIncrement) {
      state.lastEmittedHod = input.sessionHigh;
      emit("NEW_HOD");
    }
  }

  // ── VWAP transitions ──
  const side = input.vwapSide;
  if (state.prevVwapSide === "below" && side === "above") {
    emit("VWAP_RECLAIM");
  }
  if (state.prevVwapSide === "above" && side === "below") {
    emit("VWAP_LOSS");
  }
  if (side !== "unknown") {
    state.prevVwapSide = side;
  }

  // ── Lifecycle ──
  const vol15 = input.vol15s ?? 0;
  const vol60 = input.vol60s ?? 0;
  const move15 = input.move15Complete ? input.move15sPct : null;

  if (state.phase === "IDLE") {
    if (
      input.detect ||
      (finite(input.sessionVolume) &&
        input.sessionVolume >= cfg.buildingMinSessionVolume)
    ) {
      state.phase = "BUILDING";
    }
  }
  if (state.phase === "BUILDING") {
    if (
      input.active &&
      input.move15Complete &&
      finite(move15) &&
      move15 > 0
    ) {
      state.phase = "MOMENTUM";
      state.peakVol15InMomentum = vol15;
      state.momentumLegConfirmed = true;
      state.hadPullbackSinceLeg = false;
      state.secondLegEmitted = false;
      emit("MOMENTUM_TRIGGER");
    }
  } else if (state.phase === "MOMENTUM") {
    state.peakVol15InMomentum = Math.max(state.peakVol15InMomentum, vol15);
    const volPullback = state.peakVol15InMomentum > 0 &&
      vol15 < cfg.pullbackVolFraction * state.peakVol15InMomentum;
    const movePullback = finite(move15) && move15 < cfg.pullbackMove15Pct;
    if (volPullback || movePullback) {
      state.phase = "PULLBACK";
      state.pullbackEpisodeOpen = true;
      state.hadPullbackSinceLeg = true;
      state.consecutiveActiveInReaccel = 0;
      emit("PULLBACK");
    } else if (vol60 < cfg.coolingVol60Ceiling) {
      state.consecutiveLowVol60 += 1;
      if (state.consecutiveLowVol60 >= cfg.coolingEvals) {
        state.phase = "COOLING";
        state.consecutiveLowVol60 = 0;
      }
    } else {
      state.consecutiveLowVol60 = 0;
    }
  } else if (state.phase === "PULLBACK") {
    if (
      input.active &&
      input.move15Complete &&
      finite(move15) &&
      move15 > 0
    ) {
      state.phase = "RE_ACCELERATING";
      state.consecutiveActiveInReaccel = 1;
      emit("RE_ACCELERATION");
    }
  } else if (state.phase === "RE_ACCELERATING") {
    if (input.active) {
      state.consecutiveActiveInReaccel += 1;
    } else {
      state.consecutiveActiveInReaccel = 0;
    }
    if (
      !state.secondLegEmitted &&
      state.momentumLegConfirmed &&
      state.hadPullbackSinceLeg &&
      state.consecutiveActiveInReaccel >= cfg.reaccelConfirmEvals
    ) {
      state.phase = "SECOND_LEG";
      state.secondLegEmitted = true;
      state.pullbackEpisodeOpen = false;
      emit("SECOND_LEG");
    }
  } else if (state.phase === "COOLING") {
    if (
      input.active &&
      input.move15Complete &&
      finite(move15) &&
      move15 > 0
    ) {
      state.phase = "RE_ACCELERATING";
      state.hadPullbackSinceLeg = true;
      state.consecutiveActiveInReaccel = 1;
      emit("RE_ACCELERATION");
    } else if (vol60 < cfg.coolingVol60Ceiling) {
      state.consecutiveLowVol60 += 1;
    } else {
      state.consecutiveLowVol60 = 0;
    }
  } else if (state.phase === "SECOND_LEG") {
    if (vol60 < cfg.coolingVol60Ceiling) {
      state.consecutiveLowVol60 += 1;
      if (state.consecutiveLowVol60 >= cfg.coolingEvals) {
        state.phase = "COOLING";
        state.consecutiveLowVol60 = 0;
      }
    } else {
      state.consecutiveLowVol60 = 0;
    }
  }

  const promotionReason = buildPromotionReason(state.records, cfg);
  const persistableEvents = state.records.map((r) => ({
    type: r.type,
    eventAt: r.eventAt,
  }));

  return {
    state,
    lifecycle: state.phase,
    newEvents,
    promotionReason,
    persistableEvents,
  };
}

/** Map engine event types to radar_v22_events rows when migration is applied. */
export function radarV22EventTypeFromEngine(
  type: RadarEventEngineActiveType,
): string | null {
  switch (type) {
    case "VOLUME_100K":
    case "VOLUME_500K":
    case "VOLUME_1M":
    case "MOMENTUM_TRIGGER":
    case "RE_ACCELERATION":
    case "PULLBACK":
    case "SECOND_LEG":
    case "NEW_HOD":
    case "VWAP_RECLAIM":
    case "VWAP_LOSS":
      return type;
    default:
      return null;
  }
}
