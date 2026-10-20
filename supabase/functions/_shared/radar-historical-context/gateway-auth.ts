/**
 * Auth for radar-historical-context (public read-only market history per symbol).
 * Signed-in callers are verified via auth.getUser().
 * Anonymous callers use the public data path — no runtime public-key equality required.
 */

export type RadarHistoricalContextAuth =
  | { mode: "public" }
  | { mode: "user"; authorizationHeader: string };

export function projectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  const trimmed = supabaseUrl.trim().replace(/\/$/, "");
  const match = trimmed.match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = atob(padded + "=".repeat(padLen));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Reject credentials that must never grant access on this endpoint. */
export function rejectsUnsafeCredentialShape(
  token: string,
  projectRef: string | null,
): boolean {
  if (token.startsWith("sb_publishable_")) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (payload.role === "service_role") return true;
  if (projectRef && typeof payload.ref === "string" && payload.ref !== projectRef) {
    return true;
  }
  return false;
}

export async function authenticateRadarHistoricalContextRequest(input: {
  supabaseUrl: string;
  authorizationHeader: string | null;
  getUser: (authorizationHeader: string) => Promise<{ userId: string | null }>;
}): Promise<RadarHistoricalContextAuth | null> {
  const authHeader = input.authorizationHeader?.trim() ?? "";
  const hasBearer = /^Bearer\s+\S+/i.test(authHeader);
  const bearer = hasBearer ? authHeader.replace(/^Bearer\s+/i, "").trim() : "";

  if (authHeader.length > 0 && !hasBearer) return null;

  const projectRef = projectRefFromSupabaseUrl(input.supabaseUrl);

  if (bearer) {
    if (rejectsUnsafeCredentialShape(bearer, projectRef)) return null;

    const user = await input.getUser(authHeader);
    if (user.userId) {
      return { mode: "user", authorizationHeader: authHeader };
    }

    const payload = decodeJwtPayload(bearer);
    if (payload?.role === "authenticated") return null;
  }

  return { mode: "public" };
}
