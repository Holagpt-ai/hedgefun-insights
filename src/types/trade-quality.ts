import type {
  TradeQualityCatalystQuality,
  TradeQualityComponentKey,
  TradeQualityLabel,
  TradeQualityTechnicalSignalKey,
  TradeQualityVersion,
} from "@/config/trade-quality.config";

export type {
  TradeQualityCatalystQuality,
  TradeQualityComponentKey,
  TradeQualityLabel,
  TradeQualityTechnicalSignalKey,
  TradeQualityVersion,
};

/** Three-state boolean for technical signals. FALSE is a known negative; UNKNOWN is unavailable. */
export type TradeQualityTriState = "TRUE" | "FALSE" | "UNKNOWN";

export interface TradeQualityTechnicalInput {
  aboveVwap?: TradeQualityTriState;
  holdingVwapAfterReclaim?: TradeQualityTriState;
  nearHod?: TradeQualityTriState;
  higherHighHigherLow?: TradeQualityTriState;
  positiveMomentum?: TradeQualityTriState;
}

/**
 * Normalized inputs for Trade Quality V1 scoring.
 * Callers must not fabricate missing market data — leave fields null/undefined when unknown.
 */
export interface TradeQualityInput {
  price?: number | null;
  currentSessionVolume?: number | null;
  /** Absolute percentage move magnitude for V1. */
  absoluteMovePct?: number | null;
  catalystQuality?: TradeQualityCatalystQuality | null;
  bid?: number | null;
  ask?: number | null;
  technical?: TradeQualityTechnicalInput;
  publicFloat?: number | null;
  /** Canonical RVOL 20D — do not substitute legacy rvol or Vol/Prior. */
  rvol20d?: number | null;
}

export interface TradeQualityComponentResult {
  available: boolean;
  rawValue: number | string | null;
  score: number | null;
  maxScore: number;
}

export type TradeQualityComponents = Record<
  TradeQualityComponentKey,
  TradeQualityComponentResult
>;

export interface TradeQualityResult {
  version: TradeQualityVersion;
  /** Official normalized score (0–100) when coverage meets minimum; otherwise null. */
  score: number | null;
  rawNormalizedScore: number | null;
  coveragePct: number;
  label: TradeQualityLabel;
  availableWeight: number;
  earnedPoints: number;
  components: TradeQualityComponents;
}

export interface TradeQualityRankInput {
  symbol: string;
  discoveryRank: number;
  tradeQuality: TradeQualityResult;
  /** Tie-break: higher dollar volume wins. */
  dollarVolume?: number | null;
  /** Tie-break: higher current session volume wins. */
  currentSessionVolume?: number | null;
}

export interface TradeQualityRankedCandidate extends TradeQualityRankInput {
  /** 1-based Trade Quality rank when score is official; null when INCOMPLETE. */
  tradeQualityRank: number | null;
}

export type TradeQualityTechnicalSignals = Record<
  TradeQualityTechnicalSignalKey,
  TradeQualityTriState | undefined
>;
