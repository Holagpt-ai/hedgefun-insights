import type { SourceRecord } from "./types.ts";

export type CircuitBreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerMetadata {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  openedAtMs: number | null;
  lastHalfOpenProbeMs: number | null;
}

export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
export const CIRCUIT_HALF_OPEN_PROBES = 1;

const META_KEY = "circuit_breaker";

function readCircuit(metadata: Record<string, unknown>): CircuitBreakerMetadata {
  const raw = metadata[META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      state: "closed",
      consecutiveFailures: 0,
      openedAtMs: null,
      lastHalfOpenProbeMs: null,
    };
  }
  const row = raw as Record<string, unknown>;
  const state = row.state === "open" || row.state === "half_open" ? row.state : "closed";
  return {
    state,
    consecutiveFailures: typeof row.consecutiveFailures === "number" ? row.consecutiveFailures : 0,
    openedAtMs: typeof row.openedAtMs === "number" ? row.openedAtMs : null,
    lastHalfOpenProbeMs: typeof row.lastHalfOpenProbeMs === "number" ? row.lastHalfOpenProbeMs : null,
  };
}

function writeCircuit(metadata: Record<string, unknown>, circuit: CircuitBreakerMetadata): Record<string, unknown> {
  return { ...metadata, [META_KEY]: circuit };
}

export function circuitBreakerDecision(source: SourceRecord, nowMs: number): {
  allow: boolean;
  state: CircuitBreakerState;
  reason: string | null;
} {
  const circuit = readCircuit(source.metadata);
  if (circuit.state === "closed") return { allow: true, state: "closed", reason: null };
  if (circuit.state === "open") {
    const openedAt = circuit.openedAtMs ?? nowMs;
    if (nowMs - openedAt >= CIRCUIT_COOLDOWN_MS) {
      return { allow: true, state: "half_open", reason: "half_open_probe" };
    }
    return { allow: false, state: "open", reason: "circuit_open" };
  }
  // half_open — allow bounded probe
  const probes = circuit.lastHalfOpenProbeMs ? 1 : 0;
  if (probes >= CIRCUIT_HALF_OPEN_PROBES) {
    return { allow: false, state: "half_open", reason: "half_open_exhausted" };
  }
  return { allow: true, state: "half_open", reason: "half_open_probe" };
}

export function recordCircuitSuccess(source: SourceRecord): void {
  source.metadata = writeCircuit(source.metadata, {
    state: "closed",
    consecutiveFailures: 0,
    openedAtMs: null,
    lastHalfOpenProbeMs: null,
  });
}

export function recordCircuitFailure(source: SourceRecord, nowMs: number, retryable: boolean): void {
  if (!retryable) return;
  const circuit = readCircuit(source.metadata);
  const consecutiveFailures = circuit.consecutiveFailures + 1;
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    source.metadata = writeCircuit(source.metadata, {
      state: "open",
      consecutiveFailures,
      openedAtMs: nowMs,
      lastHalfOpenProbeMs: null,
    });
    return;
  }
  source.metadata = writeCircuit(source.metadata, {
    ...circuit,
    consecutiveFailures,
  });
}

export function markHalfOpenProbe(source: SourceRecord, nowMs: number): void {
  const circuit = readCircuit(source.metadata);
  source.metadata = writeCircuit(source.metadata, {
    ...circuit,
    state: "half_open",
    lastHalfOpenProbeMs: nowMs,
  });
}

export function summarizeSourceOperationalState(source: SourceRecord, nowMs: number): Record<string, unknown> {
  const circuit = readCircuit(source.metadata);
  const decision = circuitBreakerDecision(source, nowMs);
  return {
    source_id: source.id,
    source_key: source.sourceKey,
    source_type: source.sourceType,
    enabled: source.enabled,
    last_success_at: source.lastSuccessAt,
    last_error_category: source.lastErrorCategory,
    failure_count: source.failureCount,
    backoff_until: source.backoffUntil,
    circuit_state: decision.state,
    circuit_allow_fetch: decision.allow,
    fresh: source.lastSuccessAt
      ? nowMs - Date.parse(source.lastSuccessAt) <= source.pollIntervalSeconds * 1000 * 2
      : false,
  };
}
