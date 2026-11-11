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
  | "SESSION_KIND_MISMATCH"
  | "SYMBOL_MISMATCH"
  | "RADAR_POLYGON_OBSERVATION_DESYNC"
  | "OBSERVATION_SESSION_OVERRIDE_REJECTED"
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
   * Legacy callers may set this for tests; adapter rejects when it disagrees with
   * provider-derived observation session (cannot mask overnight or cross-session).
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
  /** Independently verified 10-minute shares/minute — not inferred from 5m Radar fields. */
  verifiedSharesPerMinute10m?: number | null;
  spreadPct?: number | null;
  catalystVerified?: PennyContinuationInput["catalystVerified"];
  catalystAgeHours?: number | null;
  catalystInvalidated?: PennyContinuationInput["catalystInvalidated"];
  floatShares?: number | null;
  floatVerified?: boolean;
  instrumentType?: string | null;
}

export interface PennyContinuationAdapterDiagnostics {
  /** Radar 5m shares/minute — diagnostic only, not used for eligibility. */
  volumeVelocity5mSharesPerMinute: number | null;
  radarStructureEvidenceAligned: boolean;
}

export interface PennyContinuationAdapterOutcome {
  input: PennyContinuationInput | null;
  adapterReasons: PennyIntegrationAdapterReason[];
  diagnostics?: PennyContinuationAdapterDiagnostics;
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
