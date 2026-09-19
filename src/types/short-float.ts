import type {
  ShortFloatFreshnessBasis,
  ShortFloatFreshnessState,
  ShortFloatModelVersion,
  ShortFloatQualityState,
  ShortFloatValueSource,
} from "@/config/short-float.config";

/**
 * Provider-neutral observation. `source` is metadata only — never branch on vendor names.
 * Borrow/utilization fields are extension points and are not scored in V1.
 */
export interface ShortFloatInput {
  symbol?: string | null;
  shortFloatPct?: number | null;
  shortInterestShares?: number | null;
  floatShares?: number | null;
  sharesOutstanding?: number | null;
  daysToCover?: number | null;
  source?: string | null;
  sourceAsOf?: string | null;
  fetchedAt?: string | null;
  borrowFeePct?: number | null;
  utilizationPct?: number | null;
  sharesAvailableToShort?: number | null;
}

export interface ShortFloatNormalizeOptions {
  /** Explicit evaluation instant. Core code does not use the system clock. */
  evaluatedAt?: string | number | null;
  discrepancyTolerancePct?: number;
  staleUsableForScoring?: boolean;
  agingUsableForScoring?: boolean;
  unknownFreshnessUsableForScoring?: boolean;
  futureClockSkewMs?: number;
}

export interface ShortFloatDiagnostic {
  code: string;
  field?: string;
  message: string;
}

export interface ShortFloatDiscrepancy {
  providerShortFloatPct: number;
  derivedShortFloatPct: number;
  absoluteDifferencePct: number;
  tolerancePct: number;
}

export interface ShortFloatNormalization {
  version: ShortFloatModelVersion;
  symbol: string | null;
  shortFloatPct: number | null;
  shortInterestShares: number | null;
  floatShares: number | null;
  sharesOutstanding: number | null;
  daysToCover: number | null;
  providerShortFloatPct: number | null;
  derivedShortFloatPct: number | null;
  valueSource: ShortFloatValueSource | null;
  discrepancy: ShortFloatDiscrepancy | null;
  source: string | null;
  sourceAsOf: string | null;
  fetchedAt: string | null;
  freshnessState: ShortFloatFreshnessState;
  freshnessBasis: ShortFloatFreshnessBasis;
  ageCalendarDays: number | null;
  qualityState: ShortFloatQualityState;
  usableForScoring: boolean;
  diagnostics: ShortFloatDiagnostic[];
}

/**
 * Compact future consumer view for screeners / Trade Quality / filters.
 * Not wired to production scoring in this sprint.
 */
export interface ShortFloatConsumerView {
  version: ShortFloatModelVersion;
  shortFloatPct: number | null;
  freshnessState: ShortFloatFreshnessState;
  qualityState: ShortFloatQualityState;
  sourceAsOf: string | null;
  usableForScoring: boolean;
}
