export const COMPUTE_LEVELS = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const;
export type TestTimeComputeLevel = (typeof COMPUTE_LEVELS)[number];

export interface TestTimeComputeSignals {
  monetaryExposure: number | null;
  missingFieldCount: number;
  signalConflictCount: number;
  novelty: boolean;
  setupEventCount: number;
  catalystUnverified: boolean;
  retrievedOutcomeDisagreement: boolean;
  dayRangeVolatilityHigh: boolean;
  regimeSampleSize: number | null;
  retrievalConfidence: number | null;
  liquidityUnknown: boolean;
}

export interface TestTimeComputeDecision {
  level: TestTimeComputeLevel;
  reasons: readonly string[];
  toolsAllowed: readonly string[];
  noTrade: boolean;
}

const TOOLS = {
  LOW: ["structured_analysis"],
  MEDIUM: ["structured_analysis", "memory_retrieval"],
  HIGH: ["structured_analysis", "memory_retrieval", "alternative_plans", "critic", "risk_stress"],
  VERY_HIGH: [],
} as const;

/** Engineering defaults. Not a live-money strategy. */
export const TEST_TIME_COMPUTE_THRESHOLDS = {
  highExposure: 200,
  manyMissingFields: 3,
  manyConflicts: 2,
  thinRegimeSample: 5,
  lowRetrievalConfidence: 0.35,
} as const;

export function selectTestTimeComputeLevel(signals: TestTimeComputeSignals): TestTimeComputeDecision {
  const reasons: string[] = [];

  if (signals.liquidityUnknown) reasons.push("liquidity_unknown");
  if (signals.missingFieldCount >= TEST_TIME_COMPUTE_THRESHOLDS.manyMissingFields) reasons.push("missing_fields");
  if (signals.signalConflictCount >= TEST_TIME_COMPUTE_THRESHOLDS.manyConflicts) reasons.push("signal_conflict");
  if (signals.novelty) reasons.push("novelty");
  if (signals.catalystUnverified) reasons.push("catalyst_unverified");
  if (signals.retrievedOutcomeDisagreement) reasons.push("historical_disagreement");
  if (signals.dayRangeVolatilityHigh) reasons.push("elevated_range");
  if (
    signals.regimeSampleSize !== null &&
    signals.regimeSampleSize < TEST_TIME_COMPUTE_THRESHOLDS.thinRegimeSample
  ) {
    reasons.push("thin_regime_sample");
  }
  if (
    signals.retrievalConfidence !== null &&
    signals.retrievalConfidence < TEST_TIME_COMPUTE_THRESHOLDS.lowRetrievalConfidence
  ) {
    reasons.push("low_retrieval_confidence");
  }
  if (
    signals.monetaryExposure !== null &&
    signals.monetaryExposure >= TEST_TIME_COMPUTE_THRESHOLDS.highExposure
  ) {
    reasons.push("high_exposure");
  }

  const veryHigh =
    signals.liquidityUnknown ||
    (signals.novelty && signals.signalConflictCount >= TEST_TIME_COMPUTE_THRESHOLDS.manyConflicts);
  if (veryHigh) {
    return { level: "VERY_HIGH", reasons, toolsAllowed: TOOLS.VERY_HIGH, noTrade: true };
  }

  const high =
    reasons.includes("high_exposure") ||
    reasons.includes("historical_disagreement") ||
    signals.setupEventCount >= 3;
  if (high) {
    return { level: "HIGH", reasons, toolsAllowed: TOOLS.HIGH, noTrade: false };
  }

  const medium = signals.novelty || signals.setupEventCount > 0 || reasons.includes("catalyst_unverified");
  if (medium) {
    return { level: "MEDIUM", reasons, toolsAllowed: TOOLS.MEDIUM, noTrade: false };
  }

  return { level: "LOW", reasons, toolsAllowed: TOOLS.LOW, noTrade: false };
}
