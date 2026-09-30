// Operational defaults. Cadence is stored on catalyst_intel_bot_config and
// catalyst_intel_sources so it can be tuned without a code change.
// These constants are the recommended V1 starting targets.

import type { BotId } from "./types.ts";

export const MAX_RESPONSE_BYTES = 1_000_000;
export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_REDIRECTS = 3;
export const MAX_ITEMS_PER_SOURCE = 40;
export const MAX_EXCERPT_CHARS = 1_500;
export const DEFAULT_REACTION_MAX_AGE_MS = 15 * 60 * 1000;
export const GENERIC_USER_AGENT =
  "StocksistCatalystIntelligence/1.0 (+https://stocksist.com)";

/** Recommended poll targets in seconds. Not deployed as cron in this sprint. */
export const RECOMMENDED_CADENCE_SECONDS: Record<BotId, number> = {
  sec: 180,
  news: 180,
  ir: 600,
  events: 900,
  reactions: 60,
};

export function backoffSeconds(failureCount: number): number {
  const steps = Math.min(8, Math.max(1, Math.floor(failureCount)));
  return Math.min(3_600, 30 * 2 ** steps);
}

export function readFlag(value: string | undefined): boolean | null {
  if (value == null || value.trim() === "") return null;
  const t = value.trim().toLowerCase();
  if (t === "1" || t === "true" || t === "yes" || t === "on") return true;
  if (t === "0" || t === "false" || t === "no" || t === "off") return false;
  return null;
}

export function botEnabledFlag(bot: BotId): string {
  return `CATALYST_INTEL_${bot.toUpperCase()}_ENABLED`;
}

/** AI enrichment is off unless this exact flag is true. */
export const AI_ENRICHMENT_FLAG = "CATALYST_INTEL_AI_ENRICHMENT_ENABLED";
