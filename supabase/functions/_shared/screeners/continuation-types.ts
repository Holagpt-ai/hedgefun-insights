import type {
  ContinuationCategory,
  ContinuationComponentKey,
  ContinuationLabel,
  ContinuationModelVersion,
  ContinuationReason,
  ContinuationVelocityState,
} from "../config/continuation.config.ts";
import type { TradeQualityCatalystQuality, TradeQualityLabel } from "../config/trade-quality-lite.ts";
import type { ScreenerFilterSessionState } from "../config/screener-filters-lite.ts";

export type ContinuationTriState = "TRUE" | "FALSE" | "UNKNOWN";

/**
 * Normalized observation for continuation / day-two evaluation.
 * Callers must not fabricate missing late-session or after-hours data.
 */
export interface ContinuationInput {
  symbol: string;
  sessionDate: string;
  observedAt: string;
  sessionState?: ScreenerFilterSessionState | null;
  price?: number | null;
  sessionOpen?: number | null;
  sessionHigh?: number | null;
  sessionLow?: number | null;
  previousClose?: number | null;
  currentSessionVolume?: number | null;
  dollarVolume?: number | null;
  volumeVelocity?: ContinuationVelocityState | null;
  priceVelocity?: ContinuationVelocityState | null;
  vwap?: number | null;
  aboveVwap?: ContinuationTriState | null;
  holdingVwapAfterReclaim?: ContinuationTriState | null;
  positiveStructure?: ContinuationTriState | null;
  distanceFromHodPct?: number | null;
  floatShares?: number | null;
  floatTurnover?: number | null;
  rvol20d?: number | null;
  volumeRatioPrior?: number | null;
  catalystQuality?: TradeQualityCatalystQuality | null;
  catalystVerified?: ContinuationTriState | null;
  tradeQualityScore?: number | null;
  tradeQualityCoverage?: number | null;
  tradeQualityLabel?: TradeQualityLabel | null;
  spreadPct?: number | null;
  discoveryRank?: number | null;
  closingRejection?: ContinuationTriState | null;
  lateSessionBroken?: ContinuationTriState | null;
  afterHoursExtendsSession?: ContinuationTriState | null;
  catalystInvalidated?: ContinuationTriState | null;
  instrumentType?: string | null;
  /** Primary scanner event from Radar V2 when available (not fabricated). */
  scannerPrimaryEvent?: string | null;
  timeAdjustedRvol?: number | null;
  volumeAccelerationPct?: number | null;
  participationState?: string | null;
  radarEventLifecycle?: string | null;
  radarHasReAcceleration?: ContinuationTriState | null;
  radarHasSecondLeg?: ContinuationTriState | null;
  radarHasNewHod?: ContinuationTriState | null;
  afterHoursExtensionPct?: number | null;
  regularSessionClose?: number | null;
}

export interface ContinuationComponentResult {
  available: boolean;
  rawValue: number | string | null;
  score: number | null;
  maxScore: number;
}

export type ContinuationComponents = Record<
  ContinuationComponentKey,
  ContinuationComponentResult
>;

export interface ContinuationSessionWindow {
  isPowerHour: boolean;
  isAfterHours: boolean;
  isNearClose: boolean;
  etDate: string | null;
  msOfDay: number | null;
}

export interface ContinuationCategoryResult {
  category: ContinuationCategory;
  qualified: boolean;
  reasons: ContinuationReason[];
}

export type ContinuationDisqualifierKind = "DISQUALIFIED" | "DATA_UNAVAILABLE";

export interface ContinuationDisqualifier {
  kind: ContinuationDisqualifierKind;
  code: string;
  message: string;
}

export interface ContinuationDiagnostic {
  code: string;
  message: string;
  field?: string;
}

export interface ContinuationResult {
  version: ContinuationModelVersion;
  symbol: string;
  sessionDate: string | null;
  qualifies: boolean;
  categories: ContinuationCategory[];
  categoryResults: ContinuationCategoryResult[];
  score: number | null;
  rawNormalizedScore: number | null;
  coveragePct: number;
  availableWeight: number;
  earnedPoints: number;
  label: ContinuationLabel;
  disqualified: boolean;
  disqualifiers: ContinuationDisqualifier[];
  components: ContinuationComponents;
  window: ContinuationSessionWindow;
  discoveryRank: number | null;
  dollarVolume: number | null;
  evaluatedAt: string | null;
  diagnostics: ContinuationDiagnostic[];
}

/**
 * Consumer-safe next-session handoff. Persistence is not implemented in V1.
 * Candidates are session-scoped: they must not be carried past the intended
 * next-session lifecycle.
 */
export interface ContinuationHandoff {
  version: ContinuationModelVersion;
  sourceSessionDate: string | null;
  targetSessionDate: string | null;
  symbol: string;
  categories: ContinuationCategory[];
  continuationScore: number | null;
  continuationRank: number | null;
  discoveryRank: number | null;
  tradeQualityScore: number | null;
  catalystContext: TradeQualityCatalystQuality | null;
  generatedAt: string | null;
  lifecycle: "next-session";
}

export interface ContinuationRankInput {
  symbol: string;
  discoveryRank: number;
  continuation: ContinuationResult;
  dollarVolume?: number | null;
}

export interface ContinuationRankedCandidate extends ContinuationRankInput {
  continuationRank: number | null;
}
