/**
 * Resolves the Bearer token for radar-historical-context Edge calls.
 * Matches the Supabase browser client (publishable JWT) with legacy anon fallback.
 */

export function resolveRadarHistoricalContextAccessToken(
  sessionAccessToken: string | undefined | null,
): string | null {
  const session = sessionAccessToken?.trim();
  if (session) return session;

  const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof publishable === "string" && publishable.trim().length > 0) {
    return publishable.trim();
  }

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof anon === "string" && anon.trim().length > 0) {
    return anon.trim();
  }

  return null;
}
