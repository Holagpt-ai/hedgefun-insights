/**
 * Bounded intraday reconstruction catch-up plan (Batch 33).
 */

export const INTRADAY_CATCHUP_DEFAULTS = {
  pageLimit: 25,
  maxEpisodesPerRun: 50,
  maxProviderErrors: 10,
  includeExisting: false,
} as const;

export type IntradayCatchupLimits = {
  pageLimit: number;
  maxEpisodesPerRun: number;
  maxProviderErrors: number;
  includeExisting: boolean;
};

export function readIntradayCatchupLimitsFromEnv(
  env: { get(name: string): string | undefined } = {
    get: (name) => process.env[name],
  },
): IntradayCatchupLimits {
  const int = (name: string, fallback: number) => {
    const raw = env.get(name)?.trim();
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    pageLimit: int("INTRADAY_RECON_PAGE_LIMIT", INTRADAY_CATCHUP_DEFAULTS.pageLimit),
    maxEpisodesPerRun: int("INTRADAY_RECON_MAX_EPISODES", INTRADAY_CATCHUP_DEFAULTS.maxEpisodesPerRun),
    maxProviderErrors: int("INTRADAY_RECON_MAX_PROVIDER_ERRORS", INTRADAY_CATCHUP_DEFAULTS.maxProviderErrors),
    includeExisting: env.get("INTRADAY_RECON_INCLUDE_EXISTING") === "1",
  };
}

export type IntradayOutcomeBucket = "complete" | "partial" | "unavailable" | "daily_only" | "provider_failed";

export function classifyIntradayOutcome(completeness: string | null | undefined): IntradayOutcomeBucket {
  if (completeness === "COMPLETE") return "complete";
  if (completeness === "PARTIAL") return "partial";
  if (completeness === "DAILY_ONLY") return "daily_only";
  return "unavailable";
}

export function intradayPilotPlan(): readonly string[] {
  return [
    "Pilot: INTRADAY_RECON_MAX_EPISODES=10, verify bridge list + one SIGNIFICANT episode persisted.",
    "Confirm episode_id pagination and that existing COMPLETE rows are skipped (default).",
    "Continuation: raise INTRADAY_RECON_MAX_EPISODES in steps (50, 100) with INTRADAY_RECON_MAX_PROVIDER_ERRORS=10.",
    "Stop when provider errors reach limit or eligible queue is empty.",
  ];
}
