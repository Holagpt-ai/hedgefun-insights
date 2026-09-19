import type {
  TriggerReason,
  TriggerTimeVersion,
  TriggerType,
  TriggerVolumeThresholdKey,
} from "@/config/trigger-time.config";
import type { TradeQualityCatalystQuality } from "@/config/trade-quality.config";

export type TriggerTriState = "TRUE" | "FALSE" | "UNKNOWN";

/**
 * Deterministic identity for a single first-trigger slot.
 * Scoped by symbol + sessionDate + triggerType + eventKey.
 */
export interface TriggerEventIdentity {
  symbol: string;
  sessionDate: string;
  triggerType: TriggerType;
  eventKey: string;
}

export interface TriggerEvent extends TriggerEventIdentity {
  version: TriggerTimeVersion;
  triggeredAt: string;
  source: string;
  reason: TriggerReason;
  threshold?: number;
  observedValue?: number | string | null;
  metadata?: TriggerEventMetadata;
}

export interface TriggerEventMetadata {
  sourcePublishedAt?: string;
  catalystEventId?: string;
  catalystQuality?: Exclude<TradeQualityCatalystQuality, "UNKNOWN">;
  volumeVelocity?: number;
  priceVelocity?: number;
  relativeAcceleration?: number;
  previousEstablishedHod?: number;
  currentPrice?: number;
  thresholdKey?: TriggerVolumeThresholdKey;
}

export interface TriggerObservation {
  symbol: string;
  /** Trading session calendar date (YYYY-MM-DD). */
  sessionDate: string;
  /** Explicit observation instant. Core evaluation never uses the system clock. */
  observedAt: string;
  source?: string;
  discoveryQualified?: TriggerTriState | null;
  sessionVolume?: number | null;
  momentumQualified?: TriggerTriState | null;
  volumeVelocity?: number | null;
  priceVelocity?: number | null;
  relativeAcceleration?: number | null;
  hodBreakQualified?: TriggerTriState | null;
  previousEstablishedHod?: number | null;
  currentPrice?: number | null;
  catalystQuality?: TradeQualityCatalystQuality | null;
  /** Optional future catalyst event identity. */
  catalystEventId?: string | null;
  /** Article/source publication time. Distinct from Stocksist recognition time. */
  sourcePublishedAt?: string | null;
}

export interface TriggerState {
  version: TriggerTimeVersion;
  events: readonly TriggerEvent[];
}

export interface TriggerValidationError {
  reason: "INVALID_OBSERVATION";
  message: string;
  field?: string;
}

export interface TriggerStateUpdateResult {
  version: TriggerTimeVersion;
  state: TriggerState;
  added: TriggerEvent[];
  backdated: TriggerEvent[];
  errors: TriggerValidationError[];
}

export interface TriggerSummary {
  firstTriggerAt: string | null;
  discoveryTriggerAt: string | null;
  earliestVolumeTriggerAt: string | null;
  momentumTriggerAt: string | null;
  hodBreakTriggerAt: string | null;
  catalystTriggerAt: string | null;
}
