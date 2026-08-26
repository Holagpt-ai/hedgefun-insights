// Radar worker invocation auth — RADAR_WORKER_SECRET Bearer only.
// SUPABASE_SERVICE_ROLE_KEY must never be accepted as an invocation credential.
// Never logs or returns secret values.

import { timingSafeMatch } from "../_shared/timing-safe.ts";

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401; error: "unauthorized" };

export type EnvReader = (key: string) => string | undefined;

/**
 * Authorize a Radar worker bridge call with Authorization: Bearer ${RADAR_WORKER_SECRET}.
 * Fail closed when the secret is missing or the header is wrong. Always 401.
 */
export async function authorizeRadarWorker(
  authHeader: string | null,
  env: EnvReader = (k) => Deno.env.get(k) ?? undefined,
): Promise<AuthResult> {
  const configured = env("RADAR_WORKER_SECRET") ?? "";
  if (!configured) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const presented = authHeader ?? "";
  const matched = await timingSafeMatch(presented, `Bearer ${configured}`);
  if (!matched) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}
