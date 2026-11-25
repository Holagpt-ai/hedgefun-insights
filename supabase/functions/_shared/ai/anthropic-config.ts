/**
 * Shared Anthropic model resolution for Watchlist, Daily Brief, and other Haiku surfaces.
 * Secrets stay in env; only model id strings are read here.
 */

export const DEFAULT_ANTHROPIC_HAIKU_MODEL = "claude-haiku-4-5-20251001";

const MODEL_ID_RE = /^claude-[a-z0-9][a-z0-9._-]{2,127}$/i;

export function sanitizeAnthropicModelId(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (!MODEL_ID_RE.test(trimmed)) return null;
  return trimmed;
}

function resolveFromEnvKeys(
  env: Record<string, string | undefined>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const parsed = sanitizeAnthropicModelId(env[key]);
    if (parsed) return parsed;
  }
  return DEFAULT_ANTHROPIC_HAIKU_MODEL;
}

/** Watchlist: WATCHLIST_AI_MODEL → ANTHROPIC_MODEL → default (never DAILY_BRIEF_MODEL). */
export function resolveWatchlistAnthropicModelId(
  env: Record<string, string | undefined>,
): string {
  return resolveFromEnvKeys(env, ["WATCHLIST_AI_MODEL", "ANTHROPIC_MODEL"]);
}

/** Daily Brief: DAILY_BRIEF_MODEL → ANTHROPIC_MODEL → default (never WATCHLIST_AI_MODEL). */
export function resolveDailyBriefAnthropicModelId(
  env: Record<string, string | undefined>,
): string {
  return resolveFromEnvKeys(env, ["DAILY_BRIEF_MODEL", "ANTHROPIC_MODEL"]);
}

const PERMANENT_ERROR_TYPES = new Set([
  "authentication_error",
  "permission_error",
  "not_found_error",
  "invalid_request_error",
  "request_too_large",
]);

export function isPermanentAnthropicHttpFailure(input: {
  httpStatus: number | null;
  errorType: string | null | undefined;
}): boolean {
  const status = input.httpStatus;
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 402) {
    return true;
  }
  const type = input.errorType?.trim().toLowerCase() ?? "";
  if (type && PERMANENT_ERROR_TYPES.has(type)) return true;
  return false;
}