/**
 * Historical backfill engine V1.
 *
 * Conservative defaults for a future five-year run. They are not optimized
 * episode thresholds. The default end date is the caller-supplied completed
 * session, never the system clock.
 */

export const HISTORICAL_BACKFILL_DEFAULT_DATE_FROM = "2021-09-01";

export const HISTORICAL_DAILY_DETECTOR_ID = "HISTORICAL_DAILY_V1";

export const HISTORICAL_BACKFILL_DEFAULTS = {
  securityBatchSize: 5,
  dateChunkDays: 90,
  maxConcurrentProviderRequests: 1,
  retryCount: 3,
  retryBackoffMs: 500,
  maxChunksPerRun: 5,
  rvolMinSessions: 20,
  notableEligibleForDeepReconstruction: false,
  /**
   * Absolute daily move, in percent, required for each tier when no other
   * rule matches. Higher tiers are checked first.
   */
  notableAbsMovePct: 10,
  significantAbsMovePct: 25,
  extremeAbsMovePct: 50,
  notableRvol: 3,
  significantRvol: 5,
  extremeRvol: 10,
  notableDollarVolume: 5_000_000,
  significantDollarVolume: 25_000_000,
  extremeDollarVolume: 100_000_000,
  notableRangePct: 15,
  significantRangePct: 30,
  extremeRangePct: 60,
} as const;

export type HistoricalBackfillConfig = {
  securityBatchSize: number;
  dateChunkDays: number;
  maxConcurrentProviderRequests: number;
  retryCount: number;
  retryBackoffMs: number;
  maxChunksPerRun: number;
  rvolMinSessions: number;
  notableEligibleForDeepReconstruction: boolean;
  notableAbsMovePct: number;
  significantAbsMovePct: number;
  extremeAbsMovePct: number;
  notableRvol: number;
  significantRvol: number;
  extremeRvol: number;
  notableDollarVolume: number;
  significantDollarVolume: number;
  extremeDollarVolume: number;
  notableRangePct: number;
  significantRangePct: number;
  extremeRangePct: number;
};

export function historicalBackfillConfig(
  overrides: Partial<HistoricalBackfillConfig> = {},
): HistoricalBackfillConfig {
  return { ...HISTORICAL_BACKFILL_DEFAULTS, ...overrides };
}
