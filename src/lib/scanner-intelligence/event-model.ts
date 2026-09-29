/**
 * Scanner intelligence event contract.
 *
 * Detection lives in supabase/functions/_shared/radar-v22/scanner-events.ts
 * and the stream worker. This module is the frontend view of the same types.
 *
 * Persisted primary types stay the existing scanner set. Product names map
 * onto those types instead of a second detector:
 *   HIGH_OF_DAY_MOMENTUM → HOD_MOMENTUM
 *   VWAP_BREAK           → VWAP_LOSS
 * VOLUME_ACCELERATION is derived from the smoothed 5-minute acceleration
 * metric and may appear on scanner_events. It is not a primary type and
 * is not an alert firing.
 */

export const SCANNER_EVENT_PRODUCT_ALIASES = {
  HIGH_OF_DAY_MOMENTUM: "HOD_MOMENTUM",
  VWAP_BREAK: "VWAP_LOSS",
} as const;

export const INTELLIGENCE_EVENT_TYPES = [
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "RUNNING_UP",
  "VWAP_RECLAIM",
  "GAP_CONTINUATION",
  "LATE_DAY_ACCELERATION",
  "VOLUME_EXPLOSION",
  "VWAP_LOSS",
  "VOLUME_ACCELERATION",
] as const;

export type IntelligenceEventType = (typeof INTELLIGENCE_EVENT_TYPES)[number];

const EVENT_TYPE_SET = new Set<string>(INTELLIGENCE_EVENT_TYPES);

export function canonicalIntelligenceEventType(value: string | null | undefined): IntelligenceEventType | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase();
  const aliased = SCANNER_EVENT_PRODUCT_ALIASES[raw as keyof typeof SCANNER_EVENT_PRODUCT_ALIASES] ?? raw;
  return EVENT_TYPE_SET.has(aliased) ? aliased as IntelligenceEventType : null;
}

export const INTELLIGENCE_EVENT_LABELS: Record<IntelligenceEventType, string> = {
  HOD_BREAK: "HOD Break",
  HOD_MOMENTUM: "HOD Momentum",
  RUNNING_UP: "Running Up",
  VWAP_RECLAIM: "VWAP Reclaim",
  GAP_CONTINUATION: "Gap Continuation",
  LATE_DAY_ACCELERATION: "Late Day Acceleration",
  VOLUME_EXPLOSION: "Volume Explosion",
  VWAP_LOSS: "VWAP Break",
  VOLUME_ACCELERATION: "Volume Acceleration",
};

export function intelligenceEventLabel(value: string | null | undefined): string | null {
  const type = canonicalIntelligenceEventType(value);
  return type ? INTELLIGENCE_EVENT_LABELS[type] : null;
}

export const MOMENTUM_EVENT_TYPES = [
  "VOLUME_EXPLOSION",
  "RUNNING_UP",
  "VOLUME_ACCELERATION",
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "LATE_DAY_ACCELERATION",
] as const;

/** Same share floor the scanner event book already uses for liquidityOk. */
export const SCANNER_EVENT_MIN_SESSION_VOLUME = 100_000;
