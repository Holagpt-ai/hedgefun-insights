import { PRODUCTION_PROJECT_REF, requireProductionDatabaseUrl } from "@/lib/persistence/production-database";

/**
 * Trusted Shadow worker env. No values are read at import.
 * Never use VITE_* for service-role access.
 */
export const SHADOW_WORKER_ENV_KEYS = {
  supabaseUrl: "SUPABASE_URL",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  pollIntervalMs: "AI_TRADER_SHADOW_WORKER_POLL_INTERVAL_MS",
  workerId: "AI_TRADER_SHADOW_WORKER_ID",
  logLevel: "AI_TRADER_SHADOW_WORKER_LOG_LEVEL",
  healthPort: "AI_TRADER_SHADOW_WORKER_HEALTH_PORT",
  gitSha: "AI_TRADER_SHADOW_WORKER_GIT_SHA",
  databaseUrl: "HISTORICAL_PRODUCTION_DATABASE_URL",
} as const;

export const SHADOW_WORKER_DATABASE_URL_KEYS = [
  "HISTORICAL_PRODUCTION_DATABASE_URL",
  "LOVABLE_DB_MIGRATION_URL",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
] as const;

/** Infrastructure default for OFF/SHADOW observation. Not an alpha or strategy constant. */
export const DEFAULT_SHADOW_WORKER_POLL_INTERVAL_MS = 60_000;
export const MIN_SHADOW_WORKER_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_SHADOW_WORKER_HEALTH_PORT = 8080;

export type ShadowWorkerLogLevel = "info" | "error";

export interface ShadowWorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  pollIntervalMs: number;
  workerId: string;
  logLevel: ShadowWorkerLogLevel;
  healthPort: number;
  gitSha: string | null;
}

export function shadowWorkerUsesBrowserEnv(envName: string): boolean {
  return envName.startsWith("VITE_");
}

export function serviceRoleCredentialAccepted(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed || trimmed.startsWith("sb_publishable_") || trimmed.startsWith("VITE_")) return false;
  if (trimmed.startsWith("sb_secret_")) return true;
  const parts = trimmed.split(".");
  if (parts.length !== 3) return false;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function readPositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number | { error: string } {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) return { error: "CONFIGURATION_ERROR" };
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min || value > max) return { error: "CONFIGURATION_ERROR" };
  return value;
}

/**
 * Server-only worker configuration. Missing or browser-scoped credentials fail closed.
 * The returned object never includes a database URL; callers read that separately and must not log it.
 */
export function readShadowWorkerConfig(
  env: NodeJS.Dict<string> = process.env,
): ShadowWorkerConfig | { error: "CONFIGURATION_ERROR"; message: string } {
  const supabaseUrl = env[SHADOW_WORKER_ENV_KEYS.supabaseUrl]?.trim() ?? "";
  const supabaseServiceRoleKey = env[SHADOW_WORKER_ENV_KEYS.supabaseServiceRoleKey]?.trim() ?? "";
  if (shadowWorkerUsesBrowserEnv(SHADOW_WORKER_ENV_KEYS.supabaseUrl) || shadowWorkerUsesBrowserEnv(SHADOW_WORKER_ENV_KEYS.supabaseServiceRoleKey)) {
    return { error: "CONFIGURATION_ERROR", message: "VITE_ env is forbidden for the shadow worker" };
  }
  if (!supabaseUrl || !supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    return { error: "CONFIGURATION_ERROR", message: "SUPABASE_URL must target the Stocksist production project" };
  }
  if (!serviceRoleCredentialAccepted(supabaseServiceRoleKey)) {
    return { error: "CONFIGURATION_ERROR", message: "SUPABASE_SERVICE_ROLE_KEY must be a server service-role credential" };
  }
  try {
    requireProductionDatabaseUrl(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CONFIGURATION_ERROR";
    return { error: "CONFIGURATION_ERROR", message };
  }
  const pollIntervalMs = readPositiveInt(
    env[SHADOW_WORKER_ENV_KEYS.pollIntervalMs],
    DEFAULT_SHADOW_WORKER_POLL_INTERVAL_MS,
    MIN_SHADOW_WORKER_POLL_INTERVAL_MS,
    3_600_000,
  );
  if (typeof pollIntervalMs !== "number") {
    return { error: "CONFIGURATION_ERROR", message: "AI_TRADER_SHADOW_WORKER_POLL_INTERVAL_MS is invalid" };
  }
  const healthPort = readPositiveInt(
    env[SHADOW_WORKER_ENV_KEYS.healthPort],
    DEFAULT_SHADOW_WORKER_HEALTH_PORT,
    1,
    65_535,
  );
  if (typeof healthPort !== "number") {
    return { error: "CONFIGURATION_ERROR", message: "AI_TRADER_SHADOW_WORKER_HEALTH_PORT is invalid" };
  }
  const logRaw = env[SHADOW_WORKER_ENV_KEYS.logLevel]?.trim() || "info";
  if (logRaw !== "info" && logRaw !== "error") {
    return { error: "CONFIGURATION_ERROR", message: "AI_TRADER_SHADOW_WORKER_LOG_LEVEL is invalid" };
  }
  const workerId = env[SHADOW_WORKER_ENV_KEYS.workerId]?.trim() || "ai-trader-shadow-worker";
  const gitSha = env[SHADOW_WORKER_ENV_KEYS.gitSha]?.trim() || null;
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    pollIntervalMs,
    workerId,
    logLevel: logRaw,
    healthPort,
    gitSha,
  };
}
