/**
 * Batch 224 — bounded backend integration contract for Penny Continuation V1.
 * Callable from tests and future authorized consumers only; not production-wired.
 */

import type {
  PennyContinuationModelVersion,
  PennyDataDeliveryPolicy,
} from "../config/penny-continuation.config.ts";
import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import type { ObservationSessionKind } from "./session-sync-context.ts";
import type { PolygonTicker } from "./selection.ts";
import type {
  PennyAmInboxBadgePayload,
  PennyContinuationInput,
  PennyContinuationResult,
} from "./penny-continuation-types.ts";

export const PENNY_CONTINUATION_INTEGRATION_VERSION =
  "penny_continuation_integration_v1" as const;
export type PennyContinuationIntegrationVersion =
  typeof PENNY_CONTINUATION_INTEGRATION_VERSION;

export type PennyIntegrationAdapterReason =
  | "INVALID_SYMBOL"
  | "CANDIDATE_LIST_EMPTY"
  | "CANDIDATE_LIST_EXCEEDS_CAP"
  | "DUPLICATE_SYMBOL"
  | "MISSING_MARKET_EVIDENCE"
  | "MISSING_OBSERVATION_TS"
  | "PRIOR_CLOSE_CONFLICT"
  | "SESSION_DATE_CONFLICT"
  | "RADAR_SESSION_MISMATCH"
  | "OVERNIGHT_OBSERVATION_UNSUPPORTED";

export interface PennyContinuationIntegrationContext {
  sessionDate: string;
  evaluationClockMs: number;
  /** Screener / Radar generation sync — never substituted for symbol observation time. */
  generationSyncMs: number;
  generationSyncIso: string;
  verifiedExpectedProviderDelayMs: number | null;
  dataDeliveryPolicy: PennyDataDeliveryPolicy | null;
  observationGenerationId?: string | null;
  /** Consumer sync clock for session-volume semantics (defaults to evaluationClockMs). */
  syncNowMs?: number;
  extendedSession?: boolean;
  /**
   * When set, tags observation session for eligibility (e.g. overnight fail-closed).
   * Does not replace symbol observation timestamp.
   */
  observationSessionKind?: ObservationSessionKind;
}

export interface PennyContinuationDiscoveredCandidate {
  symbol: string;
  polygonTicker?: PolygonTicker | null;
  radarRow?: RadarV22CandidateRow | null;
  /**
   * Independently verified CS1 windows (session-aligned, `completed: true`).
   * Radar persistence does not supply these — omit when unverified.
   */
  verifiedVelocityWindows?: PennyContinuationInput["velocityWindows"];
  spreadPct?: number | null;
  catalystVerified?: PennyContinuationInput["catalystVerified"];
  catalystAgeHours?: number | null;
  catalystInvalidated?: PennyContinuationInput["catalystInvalidated"];
  floatShares?: number | null;
  floatVerified?: boolean;
  instrumentType?: string | null;
}

export interface PennyContinuationAdapterOutcome {
  input: PennyContinuationInput | null;
  adapterReasons: PennyIntegrationAdapterReason[];
}

export interface PennyContinuationIntegrationRejectionSummary {
  symbol: string;
  adapterReasons: PennyIntegrationAdapterReason[];
  result: PennyContinuationResult | null;
}

export interface PennyContinuationIntegrationResult {
  integration_version: PennyContinuationIntegrationVersion;
  model_version: PennyContinuationModelVersion;
  sessionDate: string;
  evaluatedAt: string;
  context: Pick<
    PennyContinuationIntegrationContext,
    "dataDeliveryPolicy" | "verifiedExpectedProviderDelayMs" | "observationGenerationId"
  >;
  rankedQualified: PennyContinuationResult[];
  rejections: PennyContinuationIntegrationRejectionSummary[];
  duplicateSymbolsSkipped: string[];
  badges: PennyAmInboxBadgePayload[];
  /** Shape reserved for Radar emphasis / watchlist / catalyst — not populated in Batch 224. */
  workflowHandoffReady: {
    radarEmphasis: boolean;
    amInboxBadge: boolean;
    watchlistSymbol: boolean;
    catalystSymbol: boolean;
    historicalIntelligence: boolean;
  };
}
