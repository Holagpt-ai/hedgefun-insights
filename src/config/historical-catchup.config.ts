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

/** Hard ceilings — env values above these are rejected (fail closed). */
export const HISTORICAL_CATCHUP_LIMITS_CEILING = {
  maxBatchesPerRun: 20,
  maxSymbolsPerRun: 5_000,
  maxProviderRequestsPerRun: 10_000,
  maxNoProgressBatches: 10,
  maxEmptyResolutionBatches: 5,
} as const;

export class HistoricalCatchupLimitsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalCatchupLimitsError";
  }
}

export type HistoricalCatchupLimits = {
  maxBatchesPerRun: number;
  maxSymbolsPerRun: number;
  maxProviderRequestsPerRun: number;
  maxNoProgressBatches: number;
  maxEmptyResolutionBatches: number;
};

function parseStrictLimit(
  envName: string,
  raw: string | undefined,
  fallback: number,
  ceiling: number,
): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (!/^\d+$/.test(trimmed)) {
    throw new HistoricalCatchupLimitsError(`${envName} must be a positive integer (got ${JSON.stringify(raw)})`);
  }
  const n = Number.parseInt(trimmed, 10);
  if (n < 1) {
    throw new HistoricalCatchupLimitsError(`${envName} must be >= 1 (got ${n})`);
  }
  if (n > ceiling) {
    throw new HistoricalCatchupLimitsError(`${envName} exceeds ceiling ${ceiling} (got ${n})`);
  }
  return n;
}

export function readHistoricalCatchupLimitsFromEnv(
  env: { get(name: string): string | undefined } = {
    get: (name) => process.env[name],
  },
): HistoricalCatchupLimits {
  return {
    maxBatchesPerRun: parseStrictLimit(
      "HISTORICAL_CATCHUP_MAX_BATCHES",
      env.get("HISTORICAL_CATCHUP_MAX_BATCHES"),
      HISTORICAL_CATCHUP_LIMITS.maxBatchesPerRun,
      HISTORICAL_CATCHUP_LIMITS_CEILING.maxBatchesPerRun,
    ),
    maxSymbolsPerRun: parseStrictLimit(
      "HISTORICAL_CATCHUP_MAX_SYMBOLS",
      env.get("HISTORICAL_CATCHUP_MAX_SYMBOLS"),
      HISTORICAL_CATCHUP_LIMITS.maxSymbolsPerRun,
      HISTORICAL_CATCHUP_LIMITS_CEILING.maxSymbolsPerRun,
    ),
    maxProviderRequestsPerRun: parseStrictLimit(
      "HISTORICAL_CATCHUP_MAX_PROVIDER_REQUESTS",
      env.get("HISTORICAL_CATCHUP_MAX_PROVIDER_REQUESTS"),
      HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun,
      HISTORICAL_CATCHUP_LIMITS_CEILING.maxProviderRequestsPerRun,
    ),
    maxNoProgressBatches: parseStrictLimit(
      "HISTORICAL_CATCHUP_MAX_NO_PROGRESS_BATCHES",
      env.get("HISTORICAL_CATCHUP_MAX_NO_PROGRESS_BATCHES"),
      HISTORICAL_CATCHUP_LIMITS.maxNoProgressBatches,
      HISTORICAL_CATCHUP_LIMITS_CEILING.maxNoProgressBatches,
    ),
    maxEmptyResolutionBatches: parseStrictLimit(
      "HISTORICAL_CATCHUP_MAX_EMPTY_RESOLUTION_BATCHES",
      env.get("HISTORICAL_CATCHUP_MAX_EMPTY_RESOLUTION_BATCHES"),
      HISTORICAL_CATCHUP_LIMITS.maxEmptyResolutionBatches,
      HISTORICAL_CATCHUP_LIMITS_CEILING.maxEmptyResolutionBatches,
    ),
  };
}

export const HISTORICAL_CATCHUP_PREFLIGHT_ENV = "HISTORICAL_CATCHUP_PREFLIGHT_ONLY";

/** When set to 1, resume an existing interrupted job only — no new eligibility batches (Batch 33.6). */
export const HISTORICAL_CATCHUP_RESUME_ONLY_ENV = "HISTORICAL_CATCHUP_RESUME_ONLY";

/** Required when {@link HISTORICAL_CATCHUP_RESUME_ONLY_ENV} is enabled — exact backfill job UUID. */
export const HISTORICAL_CATCHUP_RESUME_JOB_ID_ENV = "HISTORICAL_CATCHUP_RESUME_JOB_ID";

export class HistoricalCatchupResumeOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalCatchupResumeOnlyError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readHistoricalCatchupResumeOnlyFromEnv(
  env: { get(name: string): string | undefined } = {
    get: (name) => process.env[name],
  },
): { enabled: boolean; jobId: string | null } {
  const enabled = env.get(HISTORICAL_CATCHUP_RESUME_ONLY_ENV)?.trim() === "1";
  if (!enabled) {
    return { enabled: false, jobId: null };
  }
  const rawJobId = env.get(HISTORICAL_CATCHUP_RESUME_JOB_ID_ENV)?.trim() ?? "";
  if (!rawJobId) {
    throw new HistoricalCatchupResumeOnlyError(
      `${HISTORICAL_CATCHUP_RESUME_JOB_ID_ENV} is required when ${HISTORICAL_CATCHUP_RESUME_ONLY_ENV}=1`,
    );
  }
  if (!UUID_RE.test(rawJobId)) {
    throw new HistoricalCatchupResumeOnlyError(
      `${HISTORICAL_CATCHUP_RESUME_JOB_ID_ENV} must be a UUID (got ${JSON.stringify(rawJobId)})`,
    );
  }
  return { enabled: true, jobId: rawJobId };
}

export function isHistoricalCatchupResumeOnlyEnabled(
  env: { get(name: string): string | undefined } = {
    get: (name) => process.env[name],
  },
): boolean {
  return env.get(HISTORICAL_CATCHUP_RESUME_ONLY_ENV)?.trim() === "1";
}
