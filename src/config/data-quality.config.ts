/**
 * Screener Intelligence V2 data-quality contract.
 *
 * Canonical states for value trust, freshness, provenance, and usability.
 * Not wired to Trade Quality, filters, Trigger Time, Short Float, or Continuation.
 * RVOL 20D and Dollar Volume consume this contract through the screener Data Quality adapter.
 */

export const DATA_QUALITY_CONTRACT_VERSION = "v1" as const;
export type DataQualityContractVersion = typeof DATA_QUALITY_CONTRACT_VERSION;

export const DATA_QUALITY_STATES = [
  "AUTHORITATIVE",
  "DERIVED",
  "PARTIAL",
  "DISCREPANCY",
  "UNAVAILABLE",
  "INVALID",
] as const;
export type DataQualityState = (typeof DATA_QUALITY_STATES)[number];

export const DATA_FRESHNESS_STATES = ["FRESH", "AGING", "STALE", "UNKNOWN"] as const;
export type DataFreshnessState = (typeof DATA_FRESHNESS_STATES)[number];

export const DATA_PROVENANCE_STATES = [
  "PROVIDER",
  "DERIVED",
  "INTERNAL",
  "COMPOSITE",
  "UNKNOWN",
] as const;
export type DataProvenanceState = (typeof DATA_PROVENANCE_STATES)[number];

export const DATA_QUALITY_DIAGNOSTIC_CODES = [
  "MISSING_VALUE",
  "INVALID_NUMBER",
  "INVALID_TIMESTAMP",
  "STALE_DATA",
  "SOURCE_DISCREPANCY",
  "INSUFFICIENT_INPUTS",
  "UNSUPPORTED_DERIVATION",
  "FUTURE_TIMESTAMP",
  "OUT_OF_RANGE",
  "UNKNOWN_SOURCE",
  "POLICY_EXCLUDED",
] as const;
export type DataQualityDiagnosticCode = (typeof DATA_QUALITY_DIAGNOSTIC_CODES)[number];

export const DATA_FRESHNESS_RANK: Record<DataFreshnessState, number> = {
  FRESH: 0,
  AGING: 1,
  STALE: 2,
  UNKNOWN: 3,
};

export const DATA_QUALITY_FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;

export const DATA_QUALITY_METRIC_IDS = [
  "price",
  "volume",
  "dollarVolume",
  "movePct",
  "rvol20d",
  "volumeRatioPrior",
  "float",
  "floatTurnover",
  "shortFloatPct",
  "spreadPct",
  "marketCap",
  "tradeQualityScore",
  "catalystQuality",
  "triggerTime",
] as const;

export type DataQualityMetricId = (typeof DATA_QUALITY_METRIC_IDS)[number];

export interface DataQualityMetricPolicy {
  id: DataQualityMetricId;
  allowsZero: boolean;
  allowsNegative: boolean;
  requiresPositive: boolean;
  staleDisplayAllowed: boolean;
  staleFilteringAllowed: boolean;
  staleScoringAllowed: boolean;
  agingScoringAllowed: boolean;
  agingFilteringAllowed: boolean;
}

const DEFAULT_NONNEGATIVE: Omit<DataQualityMetricPolicy, "id"> = {
  allowsZero: true,
  allowsNegative: false,
  requiresPositive: false,
  staleDisplayAllowed: true,
  staleFilteringAllowed: false,
  staleScoringAllowed: false,
  agingScoringAllowed: true,
  agingFilteringAllowed: true,
};

const DEFAULT_POSITIVE: Omit<DataQualityMetricPolicy, "id"> = {
  ...DEFAULT_NONNEGATIVE,
  allowsZero: false,
  requiresPositive: true,
};

export const DATA_QUALITY_METRIC_POLICIES: Record<DataQualityMetricId, DataQualityMetricPolicy> = {
  price: { id: "price", ...DEFAULT_POSITIVE },
  volume: { id: "volume", ...DEFAULT_NONNEGATIVE },
  dollarVolume: { id: "dollarVolume", ...DEFAULT_NONNEGATIVE },
  movePct: {
    id: "movePct",
    allowsZero: true,
    allowsNegative: true,
    requiresPositive: false,
    staleDisplayAllowed: true,
    staleFilteringAllowed: false,
    staleScoringAllowed: false,
    agingScoringAllowed: true,
    agingFilteringAllowed: true,
  },
  rvol20d: { id: "rvol20d", ...DEFAULT_NONNEGATIVE },
  volumeRatioPrior: { id: "volumeRatioPrior", ...DEFAULT_NONNEGATIVE },
  float: { id: "float", ...DEFAULT_POSITIVE },
  floatTurnover: { id: "floatTurnover", ...DEFAULT_NONNEGATIVE },
  shortFloatPct: { id: "shortFloatPct", ...DEFAULT_NONNEGATIVE },
  spreadPct: { id: "spreadPct", ...DEFAULT_NONNEGATIVE },
  marketCap: { id: "marketCap", ...DEFAULT_POSITIVE },
  tradeQualityScore: { id: "tradeQualityScore", ...DEFAULT_NONNEGATIVE },
  catalystQuality: { id: "catalystQuality", ...DEFAULT_NONNEGATIVE, allowsZero: false },
  triggerTime: { id: "triggerTime", ...DEFAULT_NONNEGATIVE, allowsZero: false },
};
