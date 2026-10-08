/**
 * Server-side model and limit policy for the AI Analyst chat function.
 * Enforcement stays here so edge-function tests can cover it without booting `serve`.
 */

export const MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const MODEL_SONNET = "claude-sonnet-4-6";
export const MODEL_OPUS = "claude-opus-4-8";

export const FREE_DAILY_MESSAGE_LIMIT = 5;
export const ANONYMOUS_SESSION_MESSAGE_LIMIT = 3;
export const PRO_OPUS_DAILY_CAP = 20;

export type Tier = "fast" | "standard" | "deep";

export function tierFromRequest(model: unknown): Tier {
  if (model === "fast" || model === "standard" || model === "deep") return model;
  return "fast";
}

export function maxTokensFor(modelId: string): number {
  if (modelId === MODEL_OPUS) return 4096;
  if (modelId === MODEL_SONNET) return 2048;
  return 1024;
}

/**
 * Resolves the Anthropic model id from the requested tier and plan.
 * Opus daily-cap fallback for Pro is applied separately via `modelAfterOpusCap`.
 */
export function resolveModel(tier: Tier, plan: string): string {
  // Free / anonymous: always Haiku.
  if (plan !== "pro" && plan !== "admin" && plan !== "unlimited") return MODEL_HAIKU;
  if (tier === "fast") return MODEL_HAIKU;
  if (tier === "standard") return MODEL_SONNET;
  return MODEL_OPUS;
}

/** Pro Opus is capped at 20 messages/day and falls back to Sonnet. Admin and unlimited are uncapped. */
export function modelAfterOpusCap(plan: string, model: string, opusMessagesToday: number): string {
  if (plan === "pro" && model === MODEL_OPUS && opusMessagesToday >= PRO_OPUS_DAILY_CAP) {
    return MODEL_SONNET;
  }
  return model;
}

export function isFreeDailyLimitReached(messagesToday: number): boolean {
  return messagesToday >= FREE_DAILY_MESSAGE_LIMIT;
}

export function isAnonymousSessionLimitReached(userMessagesInSession: number): boolean {
  return userMessagesInSession >= ANONYMOUS_SESSION_MESSAGE_LIMIT;
}
