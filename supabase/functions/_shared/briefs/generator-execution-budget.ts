/**
 * Scheduled brief generator must finish inside brief-dispatch's invoke timeout,
 * including two provider attempts, retry backoff, context assembly, and persistence.
 */

import {
  AI_MAX_TRANSPORT_ATTEMPTS,
  AI_RETRY_BASE_MS,
  AI_RETRY_JITTER_MS,
} from "../ai/retry-policy.ts";

/** Must match brief-dispatch `fetchGenerateDailyBrief` invoke timeout. */
export const GENERATOR_INVOKE_TIMEOUT_MS = 100_000;

/** Evidence fetch, prompt build, DB read/write (conservative). */
export const BRIEF_CONTEXT_PERSISTENCE_RESERVE_MS = 12_000;

/** Safety margin below the dispatcher ceiling. */
export const BRIEF_EXECUTION_HEADROOM_MS = 3_000;

/** Deterministic worst-case backoff between transport attempts (base + max jitter). */
export const BRIEF_RETRY_BACKOFF_WORST_MS = AI_RETRY_BASE_MS + AI_RETRY_JITTER_MS;

export function briefProviderAttemptTimeoutMs(): number {
  const providerWallClockBudget =
    GENERATOR_INVOKE_TIMEOUT_MS
    - BRIEF_CONTEXT_PERSISTENCE_RESERVE_MS
    - BRIEF_RETRY_BACKOFF_WORST_MS
    - BRIEF_EXECUTION_HEADROOM_MS;
  return Math.floor(providerWallClockBudget / AI_MAX_TRANSPORT_ATTEMPTS);
}

/** Wall-clock upper bound for Anthropic transport only (both attempts + backoff). */
export function worstCaseBriefProviderWallClockMs(): number {
  return AI_MAX_TRANSPORT_ATTEMPTS * briefProviderAttemptTimeoutMs()
    + BRIEF_RETRY_BACKOFF_WORST_MS;
}

export function briefAiFitsGeneratorInvokeBudget(): boolean {
  return worstCaseBriefProviderWallClockMs()
    + BRIEF_CONTEXT_PERSISTENCE_RESERVE_MS
    + BRIEF_EXECUTION_HEADROOM_MS
    <= GENERATOR_INVOKE_TIMEOUT_MS;
}
