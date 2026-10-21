/**
 * Historical catch-up controls (Batch 33). Env-backed limits for one-shot Fly runs.
 * Secrets are never read here.
 */

export const HISTORICAL_CATCHUP_TARGET_ENV = "HISTORICAL_CATCHUP_TARGET_SESSION";

/** Prior production rollout anchor (Sep 2026 pilot). Not a silent default at runtime. */
export const HISTORICAL_ROLLOUT_ANCHOR_SESSION = "2026-09-18";

export const HISTORICAL_CATCHUP_LIMITS = {
  /** Max symbol batches started in one Fly process. */
  maxBatchesPerRun: 3,
  /** Max symbols attempted across batches in one Fly process. */
  maxSymbolsPerRun: 600,
  /** Stop when provider daily/reference calls exceed this count. */
  maxProviderRequestsPerRun: 2500,
  /** Consecutive batches with zero rows written before abort. */
  maxNoProgressBatches: 2,
  /** Consecutive batches where every symbol fails resolution. */
  maxEmptyResolutionBatches: 1,
} as const;

export type HistoricalCatchupLimits = {
  maxBatchesPerRun: number;
  maxSymbolsPerRun: number;
  maxProviderRequestsPerRun: number;
  maxNoProgressBatches: number;
  maxEmptyResolutionBatches: number;
};

export function readHistoricalCatchupLimitsFromEnv(
  env: { get(name: string): string | undefined } = {
    get: (name) => process.env[name],
  },
): HistoricalCatchupLimits {
  const int = (name: string, fallback: number) => {
    const raw = env.get(name)?.trim();
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    maxBatchesPerRun: int("HISTORICAL_CATCHUP_MAX_BATCHES", HISTORICAL_CATCHUP_LIMITS.maxBatchesPerRun),
    maxSymbolsPerRun: int("HISTORICAL_CATCHUP_MAX_SYMBOLS", HISTORICAL_CATCHUP_LIMITS.maxSymbolsPerRun),
    maxProviderRequestsPerRun: int(
      "HISTORICAL_CATCHUP_MAX_PROVIDER_REQUESTS",
      HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun,
    ),
    maxNoProgressBatches: int(
      "HISTORICAL_CATCHUP_MAX_NO_PROGRESS_BATCHES",
      HISTORICAL_CATCHUP_LIMITS.maxNoProgressBatches,
    ),
    maxEmptyResolutionBatches: int(
      "HISTORICAL_CATCHUP_MAX_EMPTY_RESOLUTION_BATCHES",
      HISTORICAL_CATCHUP_LIMITS.maxEmptyResolutionBatches,
    ),
  };
}
