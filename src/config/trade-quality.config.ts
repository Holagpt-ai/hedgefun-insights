/**
 * Trade Quality Rank V1 configuration.
 *
 * Secondary intelligence layer — does NOT affect Discovery Rank, Trader Lens,
 * RVOL bootstrap, or live screener ranking behavior.
 */

export const TRADE_QUALITY_VERSION = "v1" as const;

export type TradeQualityVersion = typeof TRADE_QUALITY_VERSION;

export const TRADE_QUALITY_LABELS = [
  "HIGH_QUALITY",
  "STRONG",
  "MODERATE",
  "WEAK",
  "LOW_QUALITY",
  "INCOMPLETE",
] as const;

export type TradeQualityLabel = (typeof TRADE_QUALITY_LABELS)[number];

/** Default minimum coverage (%) required to expose an official Trade Quality score. */
export const TRADE_QUALITY_MIN_COVERAGE_PCT = 60;

export const TRADE_QUALITY_COMPONENT_WEIGHTS = {
  dollarVolume: 25,
  movement: 15,
  catalyst: 15,
  spread: 15,
  technical: 10,
  floatTurnover: 10,
  rvol20d: 5,
  price: 5,
} as const;

export type TradeQualityComponentKey = keyof typeof TRADE_QUALITY_COMPONENT_WEIGHTS;

export const TRADE_QUALITY_TOTAL_WEIGHT = Object.values(
  TRADE_QUALITY_COMPONENT_WEIGHTS,
).reduce((sum, weight) => sum + weight, 0);

export type NumericTier = {
  readonly minInclusive: number;
  /** Null means no upper bound (final tier). */
  readonly maxExclusive: number | null;
  readonly score: number;
};

export const TRADE_QUALITY_DOLLAR_VOLUME_TIERS: readonly NumericTier[] = [
  { minInclusive: 0, maxExclusive: 1_000_000, score: 2 },
  { minInclusive: 1_000_000, maxExclusive: 3_000_000, score: 6 },
  { minInclusive: 3_000_000, maxExclusive: 10_000_000, score: 12 },
  { minInclusive: 10_000_000, maxExclusive: 25_000_000, score: 17 },
  { minInclusive: 25_000_000, maxExclusive: 50_000_000, score: 21 },
  { minInclusive: 50_000_000, maxExclusive: null, score: 25 },
] as const;

export const TRADE_QUALITY_MOVEMENT_TIERS: readonly NumericTier[] = [
  { minInclusive: 0, maxExclusive: 2, score: 1 },
  { minInclusive: 2, maxExclusive: 5, score: 4 },
  { minInclusive: 5, maxExclusive: 10, score: 8 },
  { minInclusive: 10, maxExclusive: 20, score: 12 },
  { minInclusive: 20, maxExclusive: null, score: 15 },
] as const;

export const TRADE_QUALITY_CATALYST_SCORES = {
  STRONG: 15,
  MODERATE: 10,
  WEAK: 5,
  NONE: 0,
} as const;

export type TradeQualityCatalystQuality = keyof typeof TRADE_QUALITY_CATALYST_SCORES | "UNKNOWN";

export const TRADE_QUALITY_SPREAD_TIERS: readonly NumericTier[] = [
  { minInclusive: 0, maxExclusive: 0.2000000001, score: 15 },
  { minInclusive: 0.2000000001, maxExclusive: 0.5000000001, score: 13 },
  { minInclusive: 0.5000000001, maxExclusive: 1.0000000001, score: 10 },
  { minInclusive: 1.0000000001, maxExclusive: 2.0000000001, score: 6 },
  { minInclusive: 2.0000000001, maxExclusive: 4.0000000001, score: 3 },
  { minInclusive: 4.0000000001, maxExclusive: null, score: 0 },
] as const;

export const TRADE_QUALITY_TECHNICAL_SIGNAL_WEIGHTS = {
  aboveVwap: 3,
  holdingVwapAfterReclaim: 2,
  nearHod: 2,
  higherHighHigherLow: 2,
  positiveMomentum: 1,
} as const;

export type TradeQualityTechnicalSignalKey =
  keyof typeof TRADE_QUALITY_TECHNICAL_SIGNAL_WEIGHTS;

export const TRADE_QUALITY_FLOAT_TURNOVER_TIERS: readonly NumericTier[] = [
  { minInclusive: 0, maxExclusive: 0.25, score: 1 },
  { minInclusive: 0.25, maxExclusive: 0.5, score: 3 },
  { minInclusive: 0.5, maxExclusive: 1, score: 5 },
  { minInclusive: 1, maxExclusive: 2, score: 7 },
  { minInclusive: 2, maxExclusive: 4, score: 9 },
  { minInclusive: 4, maxExclusive: null, score: 10 },
] as const;

export const TRADE_QUALITY_RVOL20D_TIERS: readonly NumericTier[] = [
  { minInclusive: 0, maxExclusive: 1, score: 0 },
  { minInclusive: 1, maxExclusive: 2, score: 1 },
  { minInclusive: 2, maxExclusive: 3, score: 2 },
  { minInclusive: 3, maxExclusive: 5, score: 3 },
  { minInclusive: 5, maxExclusive: 10, score: 4 },
  { minInclusive: 10, maxExclusive: null, score: 5 },
] as const;

export const TRADE_QUALITY_PRICE_TIERS: readonly NumericTier[] = [
  { minInclusive: 0, maxExclusive: 0.1, score: 0 },
  { minInclusive: 0.1, maxExclusive: 0.5, score: 2 },
  { minInclusive: 0.5, maxExclusive: 2, score: 4 },
  { minInclusive: 2, maxExclusive: 20, score: 5 },
  { minInclusive: 20, maxExclusive: 50, score: 4 },
  { minInclusive: 50, maxExclusive: null, score: 3 },
] as const;

export type TradeQualityLabelTier = {
  readonly minInclusive: number;
  readonly label: Exclude<TradeQualityLabel, "INCOMPLETE">;
};

export const TRADE_QUALITY_LABEL_TIERS: readonly TradeQualityLabelTier[] = [
  { minInclusive: 85, label: "HIGH_QUALITY" },
  { minInclusive: 70, label: "STRONG" },
  { minInclusive: 55, label: "MODERATE" },
  { minInclusive: 40, label: "WEAK" },
  { minInclusive: 0, label: "LOW_QUALITY" },
] as const;
