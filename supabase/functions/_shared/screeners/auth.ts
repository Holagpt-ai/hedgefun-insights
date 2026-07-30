// Screener sync trigger authentication — SYNC_SECRET Bearer only.
// SUPABASE_SERVICE_ROLE_KEY must never be accepted as an invocation credential.
// Never logs or returns secret values.

import { timingSafeMatch } from "../timing-safe.ts";

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 403; error: "Forbidden" };

export type EnvReader = (key: string) => string | undefined;

/**
 * Authorize a Screener sync invocation with Authorization: Bearer ${SYNC_SECRET}.
 * Fail closed when SYNC_SECRET is missing, or when the header is wrong.
 */
export async function authorizeScreenerSync(
  authHeader: string | null,
  env: EnvReader = (k) => Deno.env.get(k) ?? undefined,
): Promise<AuthResult> {
  const syncSecret = env("SYNC_SECRET") ?? "";
  if (!syncSecret) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const presented = authHeader ?? "";
  const matched = await timingSafeMatch(presented, `Bearer ${syncSecret}`);
  if (!matched) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}
