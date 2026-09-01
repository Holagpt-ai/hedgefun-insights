/**
 * Persistence V2: candidate snapshot + discrete events.
 *
 * Stocksist session VWAP/HOD/freshness live on candidate rows when intel exists.
 * Polygon `a` is not persisted here.
 *
 * Event identity: (trading_date, session_kind, symbol, event_type, event_at).
 * Retries are idempotent (ON CONFLICT DO NOTHING).
 *
 * VOLUME_BURST / ACCELERATION / HOD_ATTEMPT are not discrete events: those
 * clocks re-fire on every qualifying bar. They persist as candidate fields.
 *
 * Write-churn control: persist on material fingerprint change, membership
 * change, session transition, new discrete events, or checkpoint interval.
 * generation_id / updated_at / freshness_age_ms / provider_as_of do not
 * force a write. Fingerprint is recorded only after a successful RPC.
 */
import {
  isRadarV22EventType,
  isRadarV22FreshnessClass,
  isRadarV22SessionKind,
  isRadarV22VwapSide,
  RADAR_V22_CANDIDATE_CAP,
  REPLACE_RADAR_V2_RPC,
  SESSION_EVENT_SYMBOL,
  type RadarV22CandidateRow,
  type RadarV22EventRow,
  type RadarV22EventType,
  type RadarV22SessionKind,
  type ReplaceRadarV2Args,
} from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";
import {
  isRadarV22BoardLifecycle,
  signalStatusForLifecycle,
  type RadarV22Lifecycle,
  type RadarV22SignalStatus,
} from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import type { SessionIntelSnapshot } from "./geometry.ts";
import type { SessionTransition } from "./session.ts";
import type { SymbolMetrics } from "./types.ts";

export { REPLACE_RADAR_V2_RPC, RADAR_V22_CANDIDATE_CAP };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]*$/;

export type RadarV2RpcFn = (
  args: ReplaceRadarV2Args,
) => Promise<{ error: { message: string } | null }>;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  return Number.isFinite(Date.parse(value));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateRadarV2Generation(input: ReplaceRadarV2Args): boolean {
  if (!isUuid(input.p_generation_id)) return false;
  if (!isIsoDate(input.p_trading_date) || !isIsoTimestamp(input.p_synced_at)) {
    return false;
  }
  if (!isRadarV22SessionKind(input.p_session_kind)) return false;
  if (typeof input.p_sentinel_enabled !== "boolean") return false;
  if (
    input.p_last_provider_event_at !== null &&
    !isIsoTimestamp(input.p_last_provider_event_at)
  ) {
    return false;
  }
  if (
    input.p_last_receive_at !== null &&
    !isIsoTimestamp(input.p_last_receive_at)
  ) {
    return false;
  }
  if (!Array.isArray(input.p_candidates) || !Array.isArray(input.p_events)) {
    return false;
  }
  if (input.p_candidates.length > RADAR_V22_CANDIDATE_CAP) return false;

  const seen = new Set<string>();
  for (const row of input.p_candidates) {
    if (row === null || typeof row !== "object") return false;
    if (row.generation_id !== input.p_generation_id) return false;
    if (row.trading_date !== input.p_trading_date) return false;
    if (row.session_kind !== input.p_session_kind) return false;
    if (!SYMBOL_RE.test(row.symbol) || row.symbol.length > 12) return false;
    if (seen.has(row.symbol)) return false;
    seen.add(row.symbol);
    if (typeof row.lifecycle !== "string" || row.lifecycle.length === 0) {
      return false;
    }
    if (typeof row.signal_status !== "string" || row.signal_status.length === 0) {
      return false;
    }
    if (row.last_price !== null && !finiteNumber(row.last_price)) return false;
    if (row.last_price_at !== null && !isIsoTimestamp(row.last_price_at)) {
      return false;
    }
    if (row.move_15s_pct !== null && !finiteNumber(row.move_15s_pct)) {
      return false;
    }
    if (row.move_60s_pct !== null && !finiteNumber(row.move_60s_pct)) {
      return false;
    }
    if (!finiteNonNegative(row.volume_5s)) return false;
    if (!finiteNonNegative(row.volume_15s)) return false;
    if (!finiteNonNegative(row.volume_60s)) return false;
    if (!finiteNonNegative(row.session_volume)) return false;
    if (!finiteNonNegative(row.dollar_volume_60s)) return false;
    if (
      row.acceleration_5m !== null && !finiteNumber(row.acceleration_5m)
    ) {
      return false;
    }
    if (!isRadarV22VwapSide(row.vwap_side)) return false;
    if (!isRadarV22FreshnessClass(row.freshness_class)) return false;
    if (typeof row.geometry_partial !== "boolean") return false;
    if (typeof row.vwap_partial !== "boolean") return false;
    if (
      row.freshness_age_ms !== null &&
      !(Number.isInteger(row.freshness_age_ms) && row.freshness_age_ms >= 0)
    ) {
      return false;
    }
    if (typeof row.updated_at !== "string" || !isIsoTimestamp(row.updated_at)) {
      return false;
    }
  }

  const eventSeen = new Set<string>();
  for (const ev of input.p_events) {
    if (ev === null || typeof ev !== "object") return false;
    if (!isIsoDate(ev.trading_date) || !isRadarV22SessionKind(ev.session_kind)) {
      return false;
    }
    if (!SYMBOL_RE.test(ev.symbol) || ev.symbol.length > 12) return false;
    if (!isRadarV22EventType(ev.event_type)) return false;
    if (!isIsoTimestamp(ev.event_at)) return false;
    const key = eventKey(ev);
    if (eventSeen.has(key)) return false;
    eventSeen.add(key);
  }
  return true;
}

export function eventKey(ev: RadarV22EventRow): string {
  return [
    ev.trading_date,
    ev.session_kind,
    ev.symbol,
    ev.event_type,
    ev.event_at,
  ].join("|");
}

function pushEvent(
  out: RadarV22EventRow[],
  seen: Set<string>,
  row: RadarV22EventRow,
): void {
  const key = eventKey(row);
  if (seen.has(key)) return;
  seen.add(key);
  out.push(row);
}

function lifecycleEventType(
  phase: string,
): RadarV22EventType | null {
  switch (phase as RadarV22Lifecycle) {
    case "DETECTED":
      return "DETECTED";
    case "CONFIRMING":
      return "CONFIRMED";
    case "ACTIVE":
      return "ACTIVE";
    case "COOLING":
      return "COOLING";
    case "REACTIVATED":
      return "REACTIVATED";
    case "ARCHIVED":
      return "ARCHIVED";
    default:
      return null;
  }
}

export function buildRadarV2Events(opts: {
  generationId: string;
  tradingDate: string;
  sessionKind: RadarV22SessionKind;
  candidates: RadarV22CandidateRow[];
  sessionTransition: SessionTransition | null;
  sessionEventAt: string | null;
  archived: Array<{ symbol: string; eventAt: string }>;
}): RadarV22EventRow[] {
  const out: RadarV22EventRow[] = [];
  const seen = new Set<string>();
  const base = {
    trading_date: opts.tradingDate,
    session_kind: opts.sessionKind,
    generation_id: opts.generationId,
  };

  const add = (
    symbol: string,
    eventType: RadarV22EventType,
    eventAt: string | null,
  ) => {
    if (eventAt === null) return;
    pushEvent(out, seen, {
      ...base,
      symbol,
      event_type: eventType,
      event_at: eventAt,
    });
  };

  for (const row of opts.candidates) {
    add(row.symbol, "PROMOTED", row.promoted_at);
    const lifeType = lifecycleEventType(row.lifecycle);
    if (lifeType) add(row.symbol, lifeType, row.lifecycle_entered_at);
    add(row.symbol, "NEW_HOD", row.last_new_hod_at);
    add(row.symbol, "HOD_BREAK", row.last_hod_break_at);
    add(row.symbol, "HOD_REJECTION", row.last_hod_reject_at);
    add(row.symbol, "VWAP_RECLAIM", row.last_vwap_reclaim_at);
    add(row.symbol, "VWAP_LOSS", row.last_vwap_loss_at);
  }

  for (const arch of opts.archived) {
    add(arch.symbol, "ARCHIVED", arch.eventAt);
  }

  if (opts.sessionTransition === "soft_pm_rth") {
    add(SESSION_EVENT_SYMBOL, "SESSION_PM_RTH", opts.sessionEventAt);
  }
  if (opts.sessionTransition === "soft_rth_ah") {
    add(SESSION_EVENT_SYMBOL, "SESSION_RTH_AH", opts.sessionEventAt);
  }

  return out;
}

export type PublishRadarResult =
  | { ok: true }
  | { ok: false; code: "validation_failed" | "persist_failed" };

export async function publishRadarV2Generation(
  rpc: RadarV2RpcFn,
  input: ReplaceRadarV2Args,
): Promise<PublishRadarResult> {
  if (!validateRadarV2Generation(input)) {
    return { ok: false, code: "validation_failed" };
  }
  try {
    const result = await rpc(input);
    if (result.error) return { ok: false, code: "persist_failed" };
  } catch {
    return { ok: false, code: "persist_failed" };
  }
  return { ok: true };
}

/**
 * V1 runs first. V2 is skipped when `v2` is null (flag off).
 * V2 throw/failure never rejects the caller and cannot roll back V1.
 */
export async function dualWriteRadarPersistence(opts: {
  v1: () => Promise<PublishRadarResult>;
  v2: (() => Promise<PublishRadarResult>) | null;
}): Promise<{
  v1: PublishRadarResult;
  v2: PublishRadarResult | "skipped";
}> {
  const v1 = await opts.v1();
  if (opts.v2 === null) return { v1, v2: "skipped" };
  try {
    const v2 = await opts.v2();
    return { v1, v2 };
  } catch {
    return { v1, v2: { ok: false, code: "persist_failed" } };
  }
}

export type MemoryRadarV2Store = {
  candidates: RadarV22CandidateRow[];
  events: RadarV22EventRow[];
  v2GenerationId: string | null;
  sessionKind: RadarV22SessionKind | null;
  apply(input: ReplaceRadarV2Args): { inserted: number };
};

export function createMemoryRadarV2Store(): MemoryRadarV2Store {
  const store: MemoryRadarV2Store = {
    candidates: [],
    events: [],
    v2GenerationId: null,
    sessionKind: null,
    apply(input) {
      if (!validateRadarV2Generation(input)) {
        throw new Error("validation_failed");
      }
      const nextCandidates = input.p_candidates.map((row) => ({ ...row }));
      const nextEvents = [...store.events];
      const seen = new Set(nextEvents.map(eventKey));
      for (const ev of input.p_events) {
        const key = eventKey(ev);
        if (seen.has(key)) continue;
        seen.add(key);
        nextEvents.push({ ...ev });
      }
      store.candidates = nextCandidates;
      store.events = nextEvents;
      store.v2GenerationId = input.p_generation_id;
      store.sessionKind = input.p_session_kind;
      return { inserted: nextCandidates.length };
    },
  };
  return store;
}

export type PersistenceV2View = {
  tradingDate: string;
  sessionKind: RadarV22SessionKind;
  liveSurveillance: boolean;
  sessionTransition: SessionTransition | null;
  sentinelEnabled: boolean;
  feedStale: boolean;
  lastReceiveAt: string | null;
  lastProviderEventAt: string | null;
  candidates: RadarV22CandidateRow[];
  archived: Array<{ symbol: string; eventAt: string }>;
};

export function mapCandidateRow(opts: {
  generationId: string;
  tradingDate: string;
  sessionKind: RadarV22SessionKind;
  symbol: string;
  lifecycle: string;
  metrics: SymbolMetrics;
  intel: SessionIntelSnapshot | null;
  promotedAtMs: number | null;
  phaseEnteredAtMs: number | null;
  updatedAt: string;
  isoFromMs: (ms: number) => string | null;
}): RadarV22CandidateRow {
  const intel = opts.intel;
  const lastPrice = intel?.lastPrice ?? opts.metrics.lastPrice;
  const lastPriceAt = opts.metrics.lastBarEndMs !== null
    ? opts.isoFromMs(opts.metrics.lastBarEndMs)
    : null;
  const move15 = opts.metrics.move15s.complete &&
      opts.metrics.move15s.movePct !== null
    ? opts.metrics.move15s.movePct
    : null;
  const move60 = opts.metrics.move60s.complete &&
      opts.metrics.move60s.movePct !== null
    ? opts.metrics.move60s.movePct
    : null;
  const signal: RadarV22SignalStatus = isRadarV22BoardLifecycle(opts.lifecycle)
    ? signalStatusForLifecycle(opts.lifecycle, false)
    : "INACTIVE";
  const iso = (ms: number | null): string | null =>
    ms === null ? null : opts.isoFromMs(ms);
  const hodPct = intel?.hodDistance !== null && intel?.hodDistance !== undefined
    ? intel.hodDistance * 100
    : null;
  return {
    generation_id: opts.generationId,
    trading_date: opts.tradingDate,
    session_kind: opts.sessionKind,
    symbol: opts.symbol,
    lifecycle: opts.lifecycle,
    signal_status: signal,
    last_price: lastPrice,
    last_price_at: lastPriceAt,
    move_15s_pct: move15,
    move_60s_pct: move60,
    volume_5s: opts.metrics.vol5s,
    volume_15s: opts.metrics.vol15s,
    volume_60s: opts.metrics.vol60s,
    session_volume: intel !== null && intel.sessionVolumeSum > 0
      ? intel.sessionVolumeSum
      : opts.metrics.sessionVolume,
    dollar_volume_60s: opts.metrics.dollarVol60s,
    acceleration_5m: opts.metrics.acceleration5m,
    session_high: intel?.sessionHigh ?? null,
    session_low: intel?.sessionLow ?? null,
    distance_from_hod_pct: hodPct,
    session_vwap: intel?.sessionVwap ?? null,
    vwap_side: intel?.vwapSide ?? "unknown",
    geometry_partial: intel?.geometryPartial ?? true,
    vwap_partial: intel?.vwapPartial ?? true,
    last_new_hod_at: iso(intel?.lastNewHodMs ?? null),
    last_hod_attempt_at: iso(intel?.lastHodAttemptMs ?? null),
    last_hod_break_at: iso(intel?.lastHodBreakMs ?? null),
    last_hod_reject_at: iso(intel?.lastHodRejectMs ?? null),
    last_vwap_cross_at: iso(intel?.lastVwapCrossMs ?? null),
    last_vwap_reclaim_at: iso(intel?.lastVwapReclaimMs ?? null),
    last_vwap_loss_at: iso(intel?.lastVwapLossMs ?? null),
    freshness_class: intel?.freshnessClass ?? "unknown",
    freshness_age_ms: intel?.freshnessAgeMs !== null &&
        intel !== null && intel.freshnessAgeMs >= 0
      ? Math.trunc(intel.freshnessAgeMs)
      : null,
    last_volume_burst_at: iso(intel?.lastVolumeBurstMs ?? null),
    last_price_move_at: iso(intel?.lastPriceMoveMs ?? null),
    last_acceleration_at: iso(intel?.lastAccelerationMs ?? null),
    promoted_at: iso(opts.promotedAtMs),
    lifecycle_entered_at: iso(opts.phaseEnteredAtMs),
    provider_as_of: lastPriceAt,
    updated_at: opts.updatedAt,
  };
}

export function replaceArgsFromView(opts: {
  generationId: string;
  syncedAt: string;
  view: PersistenceV2View;
}): ReplaceRadarV2Args {
  const events = buildRadarV2Events({
    generationId: opts.generationId,
    tradingDate: opts.view.tradingDate,
    sessionKind: opts.view.sessionKind,
    candidates: opts.view.candidates,
    sessionTransition: opts.view.sessionTransition,
    sessionEventAt: opts.view.lastProviderEventAt ?? opts.syncedAt,
    archived: opts.view.archived,
  });
  return {
    p_generation_id: opts.generationId,
    p_trading_date: opts.view.tradingDate,
    p_session_kind: opts.view.sessionKind,
    p_synced_at: opts.syncedAt,
    p_candidates: opts.view.candidates,
    p_events: events,
    p_sentinel_enabled: opts.view.sentinelEnabled,
    p_last_provider_event_at: opts.view.lastProviderEventAt,
    p_last_receive_at: opts.view.lastReceiveAt,
  };
}

export function shouldPublishRadarV2(
  flagEnabled: boolean,
  result: {
    staleTransition: boolean;
    liveSurveillance: boolean;
    sessionReset: boolean;
    persistEmpty: boolean;
    sessionKind: string;
  },
): boolean {
  if (!flagEnabled) return false;
  if (result.staleTransition) return false;
  return result.liveSurveillance || result.sessionReset ||
    result.persistEmpty || result.sessionKind === "closed";
}

/**
 * Fingerprint numeric normalization. Applied only to the churn hash, not
 * to persisted values.
 *
 * - price / VWAP / session high-low: 4 decimal places (sub-penny equities)
 * - percentages (move, distance-from-HOD): 3 decimal places of percentage points
 * - share volumes: integer shares
 * - dollar_volume_60s: 2 decimal places (currency)
 * - acceleration_5m: 3 decimal places (ratio vs preceding 60s buckets)
 */
export const RADAR_V2_PRICE_DECIMALS = 4;
export const RADAR_V2_PCT_DECIMALS = 3;
export const RADAR_V2_VOLUME_DECIMALS = 0;
export const RADAR_V2_DOLLAR_DECIMALS = 2;
export const RADAR_V2_ACCEL_DECIMALS = 3;

export function normalizeRadarV2Number(
  value: number | null,
  decimals: number,
): string {
  if (value === null || !Number.isFinite(value)) return "";
  const f = 10 ** decimals;
  return (Math.round(value * f) / f).toFixed(decimals);
}

function fingerprintClock(value: string | null): string {
  return value ?? "";
}

/**
 * Material-state fingerprint for a candidate generation.
 *
 * Included: membership, trading_date, session_kind, lifecycle, signal_status,
 * normalized price/volume/geometry, honesty flags, freshness CLASS, HOD/VWAP
 * clocks, freshness clocks, promoted_at, lifecycle_entered_at.
 *
 * Excluded (would churn every eval): generation_id, updated_at,
 * freshness_age_ms, provider_as_of, last_price_at.
 */
export function fingerprintRadarV2Generation(
  tradingDate: string,
  sessionKind: string,
  candidates: RadarV22CandidateRow[],
): string {
  const lines = candidates
    .map((row) =>
      [
        row.symbol,
        row.trading_date,
        row.session_kind,
        row.lifecycle,
        row.signal_status,
        normalizeRadarV2Number(row.last_price, RADAR_V2_PRICE_DECIMALS),
        normalizeRadarV2Number(row.move_15s_pct, RADAR_V2_PCT_DECIMALS),
        normalizeRadarV2Number(row.move_60s_pct, RADAR_V2_PCT_DECIMALS),
        normalizeRadarV2Number(row.volume_5s, RADAR_V2_VOLUME_DECIMALS),
        normalizeRadarV2Number(row.volume_15s, RADAR_V2_VOLUME_DECIMALS),
        normalizeRadarV2Number(row.volume_60s, RADAR_V2_VOLUME_DECIMALS),
        normalizeRadarV2Number(row.session_volume, RADAR_V2_VOLUME_DECIMALS),
        normalizeRadarV2Number(
          row.dollar_volume_60s,
          RADAR_V2_DOLLAR_DECIMALS,
        ),
        normalizeRadarV2Number(row.acceleration_5m, RADAR_V2_ACCEL_DECIMALS),
        normalizeRadarV2Number(row.session_high, RADAR_V2_PRICE_DECIMALS),
        normalizeRadarV2Number(row.session_low, RADAR_V2_PRICE_DECIMALS),
        normalizeRadarV2Number(
          row.distance_from_hod_pct,
          RADAR_V2_PCT_DECIMALS,
        ),
        normalizeRadarV2Number(row.session_vwap, RADAR_V2_PRICE_DECIMALS),
        row.vwap_side,
        row.geometry_partial ? "1" : "0",
        row.vwap_partial ? "1" : "0",
        row.freshness_class,
        fingerprintClock(row.last_new_hod_at),
        fingerprintClock(row.last_hod_attempt_at),
        fingerprintClock(row.last_hod_break_at),
        fingerprintClock(row.last_hod_reject_at),
        fingerprintClock(row.last_vwap_cross_at),
        fingerprintClock(row.last_vwap_reclaim_at),
        fingerprintClock(row.last_vwap_loss_at),
        fingerprintClock(row.last_volume_burst_at),
        fingerprintClock(row.last_price_move_at),
        fingerprintClock(row.last_acceleration_at),
        fingerprintClock(row.promoted_at),
        fingerprintClock(row.lifecycle_entered_at),
      ].join("\t")
    )
    .sort();
  return `${tradingDate}|${sessionKind}|${candidates.length}\n${
    lines.join("\n")
  }`;
}

export type RadarV2WriteReason =
  | "bootstrap"
  | "session"
  | "events"
  | "fingerprint"
  | "checkpoint"
  | "skip";

export type RadarV2WriteDecision = {
  shouldWrite: boolean;
  reason: RadarV2WriteReason;
  fingerprint: string;
  eventKeys: string[];
};

export type RadarV2ChurnInput = {
  wallNowMs: number;
  checkpointMs: number;
  tradingDate: string;
  sessionKind: string;
  candidates: RadarV22CandidateRow[];
  events: RadarV22EventRow[];
  sessionTransition: SessionTransition | null;
  sessionReset: boolean;
};

function isForcedSessionWrite(input: RadarV2ChurnInput): boolean {
  if (input.sessionReset) return true;
  const t = input.sessionTransition;
  return t === "hard_reset" || t === "soft_pm_rth" || t === "soft_rth_ah" ||
    t === "park_closed";
}

export type RadarV2WriteGate = {
  decide(input: RadarV2ChurnInput): RadarV2WriteDecision;
  markSuccess(decision: RadarV2WriteDecision, persistedAtMs: number): void;
};

/**
 * Last-success fingerprint/event keys update only after a successful V2 RPC.
 * A failed write leaves the gate unchanged so the next eval retries.
 */
export function createRadarV2WriteGate(): RadarV2WriteGate {
  let lastFingerprint: string | null = null;
  let lastEventKeys = new Set<string>();
  let lastSuccessMs: number | null = null;

  return {
    decide(input) {
      const fingerprint = fingerprintRadarV2Generation(
        input.tradingDate,
        input.sessionKind,
        input.candidates,
      );
      const eventKeys = input.events.map(eventKey);
      const decision = (
        shouldWrite: boolean,
        reason: RadarV2WriteReason,
      ): RadarV2WriteDecision => ({
        shouldWrite,
        reason,
        fingerprint,
        eventKeys,
      });

      if (lastFingerprint === null) return decision(true, "bootstrap");
      if (isForcedSessionWrite(input)) return decision(true, "session");
      if (eventKeys.some((key) => !lastEventKeys.has(key))) {
        return decision(true, "events");
      }
      if (fingerprint !== lastFingerprint) {
        return decision(true, "fingerprint");
      }
      const elapsed = lastSuccessMs === null
        ? input.checkpointMs
        : input.wallNowMs - lastSuccessMs;
      if (elapsed >= input.checkpointMs) {
        return decision(true, "checkpoint");
      }
      return decision(false, "skip");
    },
    markSuccess(decision, persistedAtMs) {
      lastFingerprint = decision.fingerprint;
      lastEventKeys = new Set(decision.eventKeys);
      lastSuccessMs = persistedAtMs;
    },
  };
}

export type RadarV2PublishEligibility = {
  staleTransition: boolean;
  liveSurveillance: boolean;
  sessionReset: boolean;
  persistEmpty: boolean;
  sessionKind: string;
};

/**
 * Flag/stale gate, then churn control. Marks the fingerprint only after
 * `publishRadarV2Generation` returns ok. Never throws.
 */
export async function publishRadarV2IfNeeded(opts: {
  flagEnabled: boolean;
  result: RadarV2PublishEligibility & {
    persistenceV2: PersistenceV2View;
    sessionTransition: SessionTransition | null;
  };
  gate: RadarV2WriteGate;
  wallNowMs: number;
  checkpointMs: number;
  generationId: string;
  syncedAt: string;
  rpc: RadarV2RpcFn;
}): Promise<"skipped" | PublishRadarResult> {
  if (!shouldPublishRadarV2(opts.flagEnabled, opts.result)) {
    return "skipped";
  }
  try {
    const args = replaceArgsFromView({
      generationId: opts.generationId,
      syncedAt: opts.syncedAt,
      view: opts.result.persistenceV2,
    });
    args.p_candidates = args.p_candidates.map((row) => ({
      ...row,
      generation_id: opts.generationId,
      updated_at: opts.syncedAt,
    }));
    const decision = opts.gate.decide({
      wallNowMs: opts.wallNowMs,
      checkpointMs: opts.checkpointMs,
      tradingDate: args.p_trading_date,
      sessionKind: args.p_session_kind,
      candidates: args.p_candidates,
      events: args.p_events,
      sessionTransition: opts.result.sessionTransition,
      sessionReset: opts.result.sessionReset,
    });
    if (!decision.shouldWrite) return "skipped";
    const result = await publishRadarV2Generation(opts.rpc, args);
    if (result.ok) opts.gate.markSuccess(decision, opts.wallNowMs);
    return result;
  } catch {
    return { ok: false, code: "persist_failed" };
  }
}

