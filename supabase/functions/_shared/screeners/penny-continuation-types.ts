import type {
  PennyContinuationModelVersion,
  PennyDataDeliveryPolicy,
} from "../config/penny-continuation.config.ts";
import type { ContinuationTriState } from "./continuation-types.ts";
import type { ContinuationVelocityState } from "../config/continuation.config.ts";

export type PennyCoreSignalState = "PASS" | "FAIL" | "UNKNOWN";

export type PennyReasonCode =
  | "PRICE_OUT_OF_BAND"
  | "SESSION_VOLUME_UNAVAILABLE"
  | "SESSION_VOLUME_LOW"
  | "DOLLAR_VOLUME_LOW"
  | "MOVE_UNAVAILABLE"
  | "MOVE_TOO_SMALL"
  | "SPLIT_SCALE_GUARD"
  | "SPREAD_WIDE"
  | "SPREAD_UNAVAILABLE"
  | "VELOCITY_LOW"
  | "PROVIDER_DELAY_UNKNOWN"
  | "MISSING_OBSERVATION_TS"
  | "OBSERVATION_STALE"
  | "CACHE_GENERATION_STALE"
  | "SYMBOL_OBSERVATION_SESSION_MISMATCH"
  | "CONTINUATION_SIGNALS_INSUFFICIENT"
  | "INVALID_PRICE"
  | "EXCLUDED_INSTRUMENT"
  | "CATALYST_INVALIDATED"
  | "CONTINUATION_INVALIDATED"
  | "OVERNIGHT_VOLUME_UNVERIFIED"
  | "REQUALIFY_COOLDOWN"
  | "DATA_UNAVAILABLE"
  | "INVALID_SESSION_VOLUME"
  | "INVALID_MOVE"
  | "DOLLAR_VOLUME_INCONSISTENT"
  | "PRIOR_CLOSE_UNAVAILABLE"
  | "GENERATION_EVIDENCE_UNAVAILABLE"
  | "INVALID_OBSERVATION_TS";

export type PennyDataFreshnessLabel = "live" | "delayed" | "stale" | null;

export type PennySupplementalLabel = "late_day" | "next_session_carry";

export type PennyVelocityWindowTier = Exclude<ContinuationVelocityState, "UNKNOWN">;

export interface PennyContinuationFreshnessInput {
  evaluationClockMs: number;
  symbolObservationMs: number | null;
  providerAsOfMs?: number | null;
  generationSyncMs?: number | null;
  generationSyncIso?: string | null;
  verifiedExpectedProviderDelayMs: number | null;
  dataDeliveryPolicy: PennyDataDeliveryPolicy | null;
  /** When true, apply live-session surveillance date mismatch guard. */
  enforceLiveSessionGuards?: boolean;
}

export interface PennyContinuationInput {
  symbol: string;
  sessionDate: string;
  observedAt: string;
  price: number | null;
  previousRegularClose: number | null;
  movePercentVsPriorClose: number | null;
  impliesSplitScale?: boolean;
  sessionVolumeShares: number | null;
  dollarVolume: number | null;
  sharesPerMinute10m: number | null;
  spreadPct: number | null;
  distanceFromHodPct: number | null;
  sessionHigh?: number | null;
  priceVsSessionHighDropPct?: number | null;
  vwap: number | null;
  aboveVwap: ContinuationTriState | null;
  holdingVwapAfterReclaim: ContinuationTriState | null;
  lateSessionBroken?: ContinuationTriState | null;
  velocityWindowTiers: PennyVelocityWindowTier[] | null;
  /** When set, CS1 requires three completed windows on `sessionDate` in ascending `windowEndMs` order. */
  velocityWindows?: Array<{
    tier: PennyVelocityWindowTier;
    sessionDate: string;
    windowEndMs: number;
    /** Must be true for CS1; incomplete windows are UNKNOWN. */
    completed?: boolean;
  }> | null;
  volumeAccelerationPct: number | null;
  timeAdjustedRvol: number | null;
  rvolConfidence?: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  floatShares: number | null;
  floatVerified?: boolean;
  floatTurnover: number | null;
  catalystVerified: ContinuationTriState | null;
  catalystAgeHours: number | null;
  catalystInvalidated?: ContinuationTriState | null;
  radarHasReAcceleration: ContinuationTriState | null;
  radarHasSecondLeg: ContinuationTriState | null;
  instrumentType?: string | null;
  observationSessionKind?: string | null;
  freshness: PennyContinuationFreshnessInput;
  /** Supplemental SL1 — caller may set from continuation window resolution. */
  lateDayContinuation?: boolean;
  /** Supplemental SL2. */
  nextSessionCarry?: boolean;
  observationGenerationId?: string | null;
}

export interface PennyCoreSignals {
  cs1: PennyCoreSignalState;
  cs2: PennyCoreSignalState;
  cs3: PennyCoreSignalState;
  cs4: PennyCoreSignalState;
  cs5: PennyCoreSignalState;
}

export interface PennyEligibilityResult {
  passed: boolean;
  reasons: PennyReasonCode[];
  spreadUnavailable: boolean;
  coveragePenalty: number;
}

export interface PennyEvidenceProvenance {
  symbolObservationMs: number | null;
  providerAsOfMs: number | null;
  generationSyncMs: number | null;
  verifiedExpectedProviderDelayMs: number | null;
  dataDeliveryPolicy: PennyDataDeliveryPolicy | null;
  observedLagMs: number | null;
  feedDelayMs: number | null;
}

export interface PennyContinuationResult {
  model_version: PennyContinuationModelVersion;
  symbol: string;
  sessionDate: string | null;
  qualifies: boolean;
  continuationQualified: boolean;
  eligibility: PennyEligibilityResult;
  coreSignals: PennyCoreSignals;
  corePassCount: number;
  score: number | null;
  coveragePct: number;
  rankKeys: {
    sharesPerMinute: number | null;
    sessionVolume: number | null;
    dollarVolume: number | null;
  };
  evidence: PennyEvidenceProvenance;
  feedDelayMs: number | null;
  dataFreshnessLabel: PennyDataFreshnessLabel;
  supplementalLabels: PennySupplementalLabel[];
  reasons: PennyReasonCode[];
  stableRankingKey: string | null;
  publicationIdempotencyKey: string | null;
  /** True when `enforcePublicationCooldown` suppresses repeat notification emission for symbol+session (badge may still show). */
  publicationSuppressed: boolean;
  expiresAt: string | null;
}

export interface PennyAmInboxBadgePayload {
  kind: "penny_continuation_v1";
  symbol: string;
  sessionDate: string;
  continuationQualified: boolean;
  corePassCount: number;
  dataFreshnessLabel: PennyDataFreshnessLabel;
  score: number | null;
  supplementalLabels: PennySupplementalLabel[];
  model_version: PennyContinuationModelVersion;
}
