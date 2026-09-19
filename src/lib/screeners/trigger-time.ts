/**
 * Trigger Time V1 — first-condition timestamps.
 *
 * Pure evaluation. Does not rank, filter, persist, or invent market data.
 * Earliest valid observation wins for a given event identity.
 */

import {
  TRIGGER_TIME_VERSION,
  TRIGGER_VOLUME_THRESHOLDS,
  type TriggerReason,
  type TriggerType,
  type TriggerVolumeThresholdKey,
} from "@/config/trigger-time.config";
import { isIsoDate } from "@/lib/equities-session-calendar";
import { isFiniteNumber, isPositiveFinite, parseTimestampMs } from "@/lib/screeners/contract";
import type {
  TriggerEvent,
  TriggerEventIdentity,
  TriggerEventMetadata,
  TriggerObservation,
  TriggerState,
  TriggerStateUpdateResult,
  TriggerSummary,
  TriggerTriState,
  TriggerValidationError,
} from "@/types/trigger-time";

const IDENTITY_SEPARATOR = "|";

export function emptyTriggerState(): TriggerState {
  return { version: TRIGGER_TIME_VERSION, events: [] };
}

export function normalizeTriggerSymbol(symbol: unknown): string | null {
  if (typeof symbol !== "string") return null;
  const normalized = symbol.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function toCanonicalUtcTimestamp(value: unknown): string | null {
  const ms = parseTimestampMs(value);
  if (ms === null) return null;
  return new Date(ms).toISOString();
}

export function buildTriggerEventId(identity: TriggerEventIdentity): string {
  return [
    identity.symbol,
    identity.sessionDate,
    identity.triggerType,
    identity.eventKey,
  ].join(IDENTITY_SEPARATOR);
}

function eventIdentity(event: TriggerEventIdentity): string {
  return buildTriggerEventId(event);
}

function resolveTriState(value: TriggerTriState | null | undefined): TriggerTriState {
  return value ?? "UNKNOWN";
}

function validateObservation(observation: TriggerObservation): TriggerValidationError[] {
  const errors: TriggerValidationError[] = [];
  if (normalizeTriggerSymbol(observation.symbol) === null) {
    errors.push({
      reason: "INVALID_OBSERVATION",
      field: "symbol",
      message: "Symbol is required.",
    });
  }
  if (!isIsoDate(observation.sessionDate)) {
    errors.push({
      reason: "INVALID_OBSERVATION",
      field: "sessionDate",
      message: "sessionDate must be a valid YYYY-MM-DD trading date.",
    });
  }
  if (toCanonicalUtcTimestamp(observation.observedAt) === null) {
    errors.push({
      reason: "INVALID_OBSERVATION",
      field: "observedAt",
      message: "observedAt must be a valid UTC timestamp.",
    });
  }
  if (
    observation.sessionVolume !== undefined &&
    observation.sessionVolume !== null &&
    (!isFiniteNumber(observation.sessionVolume) || observation.sessionVolume < 0)
  ) {
    errors.push({
      reason: "INVALID_OBSERVATION",
      field: "sessionVolume",
      message: "sessionVolume must be a finite number >= 0 when provided.",
    });
  }
  if (
    observation.currentPrice !== undefined &&
    observation.currentPrice !== null &&
    !isPositiveFinite(observation.currentPrice)
  ) {
    errors.push({
      reason: "INVALID_OBSERVATION",
      field: "currentPrice",
      message: "currentPrice must be a finite number > 0 when provided.",
    });
  }
  if (
    observation.previousEstablishedHod !== undefined &&
    observation.previousEstablishedHod !== null &&
    !isPositiveFinite(observation.previousEstablishedHod)
  ) {
    errors.push({
      reason: "INVALID_OBSERVATION",
      field: "previousEstablishedHod",
      message: "previousEstablishedHod must be a finite number > 0 when provided.",
    });
  }
  return errors;
}

function makeEvent(
  identity: TriggerEventIdentity,
  input: {
    triggeredAt: string;
    source: string;
    reason: TriggerReason;
    threshold?: number;
    observedValue?: number | string | null;
    metadata?: TriggerEventMetadata;
  },
): TriggerEvent {
  return {
    version: TRIGGER_TIME_VERSION,
    ...identity,
    triggeredAt: input.triggeredAt,
    source: input.source,
    reason: input.reason,
    threshold: input.threshold,
    observedValue: input.observedValue,
    metadata: input.metadata,
  };
}

function collectCandidates(observation: TriggerObservation): TriggerEvent[] {
  const symbol = normalizeTriggerSymbol(observation.symbol);
  const triggeredAt = toCanonicalUtcTimestamp(observation.observedAt);
  if (symbol === null || triggeredAt === null || !isIsoDate(observation.sessionDate)) {
    return [];
  }

  const source = observation.source?.trim() ? observation.source.trim() : "observation";
  const base = { symbol, sessionDate: observation.sessionDate };
  const events: TriggerEvent[] = [];

  if (resolveTriState(observation.discoveryQualified) === "TRUE") {
    events.push(
      makeEvent(
        { ...base, triggerType: "DISCOVERY_TRIGGER", eventKey: "DISCOVERY" },
        {
          triggeredAt,
          source,
          reason: "DISCOVERY_QUALIFIED",
          observedValue: "TRUE",
        },
      ),
    );
  }

  if (isFiniteNumber(observation.sessionVolume) && observation.sessionVolume >= 0) {
    for (const item of TRIGGER_VOLUME_THRESHOLDS) {
      if (observation.sessionVolume < item.threshold) continue;
      events.push(
        makeEvent(
          { ...base, triggerType: "VOLUME_TRIGGER", eventKey: item.key },
          {
            triggeredAt,
            source,
            reason: "SESSION_VOLUME_THRESHOLD",
            threshold: item.threshold,
            observedValue: observation.sessionVolume,
            metadata: { thresholdKey: item.key },
          },
        ),
      );
    }
  }

  if (resolveTriState(observation.momentumQualified) === "TRUE") {
    const metadata: TriggerEventMetadata = {};
    if (isFiniteNumber(observation.volumeVelocity)) metadata.volumeVelocity = observation.volumeVelocity;
    if (isFiniteNumber(observation.priceVelocity)) metadata.priceVelocity = observation.priceVelocity;
    if (isFiniteNumber(observation.relativeAcceleration)) {
      metadata.relativeAcceleration = observation.relativeAcceleration;
    }
    events.push(
      makeEvent(
        { ...base, triggerType: "MOMENTUM_TRIGGER", eventKey: "MOMENTUM" },
        {
          triggeredAt,
          source,
          reason: "MOMENTUM_QUALIFIED",
          observedValue: "TRUE",
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
      ),
    );
  }

  const hodQualified = resolveHodBreak(observation);
  if (hodQualified === "TRUE") {
    const metadata: TriggerEventMetadata = {};
    if (isPositiveFinite(observation.previousEstablishedHod)) {
      metadata.previousEstablishedHod = observation.previousEstablishedHod;
    }
    if (isPositiveFinite(observation.currentPrice)) {
      metadata.currentPrice = observation.currentPrice;
    }
    events.push(
      makeEvent(
        { ...base, triggerType: "HOD_BREAK_TRIGGER", eventKey: "HOD_BREAK" },
        {
          triggeredAt,
          source,
          reason: "HOD_BREAK",
          observedValue: isPositiveFinite(observation.currentPrice)
            ? observation.currentPrice
            : "TRUE",
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
      ),
    );
  }

  const quality = observation.catalystQuality;
  if (quality === "WEAK" || quality === "MODERATE" || quality === "STRONG") {
    const metadata: TriggerEventMetadata = { catalystQuality: quality };
    const publishedAt = toCanonicalUtcTimestamp(observation.sourcePublishedAt);
    if (publishedAt) metadata.sourcePublishedAt = publishedAt;
    if (observation.catalystEventId?.trim()) {
      metadata.catalystEventId = observation.catalystEventId.trim();
    }
    events.push(
      makeEvent(
        {
          ...base,
          triggerType: "CATALYST_TRIGGER",
          eventKey: observation.catalystEventId?.trim() || "VERIFIED_CATALYST",
        },
        {
          triggeredAt,
          source,
          reason: "VERIFIED_CATALYST",
          observedValue: quality,
          metadata,
        },
      ),
    );
  }

  return events;
}

function resolveHodBreak(observation: TriggerObservation): TriggerTriState {
  if (observation.hodBreakQualified != null) {
    return resolveTriState(observation.hodBreakQualified);
  }
  if (
    !isPositiveFinite(observation.currentPrice) ||
    !isPositiveFinite(observation.previousEstablishedHod)
  ) {
    return "UNKNOWN";
  }
  return observation.currentPrice > observation.previousEstablishedHod ? "TRUE" : "FALSE";
}

function mergeEvents(
  existing: readonly TriggerEvent[],
  incoming: readonly TriggerEvent[],
): { events: TriggerEvent[]; added: TriggerEvent[]; backdated: TriggerEvent[] } {
  const byId = new Map<string, TriggerEvent>();
  for (const event of existing) {
    byId.set(eventIdentity(event), event);
  }

  const added: TriggerEvent[] = [];
  const backdated: TriggerEvent[] = [];

  for (const candidate of incoming) {
    const id = eventIdentity(candidate);
    const current = byId.get(id);
    if (!current) {
      byId.set(id, candidate);
      added.push(candidate);
      continue;
    }

    const currentMs = parseTimestampMs(current.triggeredAt);
    const candidateMs = parseTimestampMs(candidate.triggeredAt);
    if (currentMs === null || candidateMs === null) continue;
    if (candidateMs < currentMs) {
      byId.set(id, candidate);
      backdated.push(candidate);
    }
  }

  return {
    events: [...byId.values()],
    added,
    backdated,
  };
}

/**
 * Apply one observation to trigger state.
 *
 * First valid timestamp wins. A later observation cannot move a trigger later.
 * An earlier out-of-order valid observation backdates the same identity.
 * Inputs are never mutated.
 */
export function updateTriggerState(
  existingState: TriggerState | null | undefined,
  observation: TriggerObservation,
): TriggerStateUpdateResult {
  const prior = existingState ?? emptyTriggerState();
  const priorCopy: TriggerState = {
    version: TRIGGER_TIME_VERSION,
    events: [...prior.events],
  };

  const errors = validateObservation(observation);
  const blocking = errors.some(
    (error) => error.field === "symbol" || error.field === "sessionDate" || error.field === "observedAt",
  );
  if (blocking) {
    return {
      version: TRIGGER_TIME_VERSION,
      state: priorCopy,
      added: [],
      backdated: [],
      errors,
    };
  }

  const incoming = collectCandidates(observation);
  const merged = mergeEvents(priorCopy.events, incoming);

  return {
    version: TRIGGER_TIME_VERSION,
    state: {
      version: TRIGGER_TIME_VERSION,
      events: merged.events,
    },
    added: merged.added,
    backdated: merged.backdated,
    errors,
  };
}

function earliestTimestamp(events: readonly TriggerEvent[], type?: TriggerType): string | null {
  const filtered = type ? events.filter((event) => event.triggerType === type) : events;
  let earliestMs = Number.POSITIVE_INFINITY;
  let earliest: string | null = null;
  for (const event of filtered) {
    const ms = parseTimestampMs(event.triggeredAt);
    if (ms === null) continue;
    if (ms < earliestMs) {
      earliestMs = ms;
      earliest = event.triggeredAt;
    }
  }
  return earliest;
}

export function summarizeTriggerState(state: TriggerState | null | undefined): TriggerSummary {
  const events = state?.events ?? [];
  return {
    firstTriggerAt: earliestTimestamp(events),
    discoveryTriggerAt: earliestTimestamp(events, "DISCOVERY_TRIGGER"),
    earliestVolumeTriggerAt: earliestTimestamp(events, "VOLUME_TRIGGER"),
    momentumTriggerAt: earliestTimestamp(events, "MOMENTUM_TRIGGER"),
    hodBreakTriggerAt: earliestTimestamp(events, "HOD_BREAK_TRIGGER"),
    catalystTriggerAt: earliestTimestamp(events, "CATALYST_TRIGGER"),
  };
}

export function getTriggerEvent(
  state: TriggerState | null | undefined,
  identity: TriggerEventIdentity,
): TriggerEvent | null {
  const id = buildTriggerEventId(identity);
  return state?.events.find((event) => eventIdentity(event) === id) ?? null;
}

export function isVolumeThresholdKey(value: unknown): value is TriggerVolumeThresholdKey {
  return TRIGGER_VOLUME_THRESHOLDS.some((item) => item.key === value);
}
