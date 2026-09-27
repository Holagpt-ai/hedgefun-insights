/**
 * Future deployed worker env only. No values are read at import.
 * Never use VITE_* for service-role access.
 */
export const SHADOW_WORKER_ENV_KEYS = {
  supabaseUrl: "SUPABASE_URL",
  supabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

export function shadowWorkerUsesBrowserEnv(envName: string): boolean {
  return envName.startsWith("VITE_");
}
