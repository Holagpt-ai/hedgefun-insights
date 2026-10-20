/**
 * Gateway-aligned auth for radar-historical-context.
 * Public callers must present a validated project anon JWT (not sb_publishable_*).
 * Signed-in callers use a verified user access token via auth.getUser().
 */

export type RadarHistoricalContextAuth =
  | { mode: "public" }
  | { mode: "user"; authorizationHeader: string };

export type ValidateProjectApiKey = (
  supabaseUrl: string,
  apiKey: string,
) => Promise<boolean>;

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

export function collectConfiguredProjectApiKeys(input: {
  anonKey?: string | null;
  publishableKey?: string | null;
}): string[] {
  const keys = [input.anonKey, input.publishableKey]
    .map((k) => (typeof k === "string" ? k.trim() : ""))
    .filter((k) => k.length > 0);
  return [...new Set(keys)];
}

function rejectsPublicCredentialShape(token: string, projectRef: string | null): boolean {
  if (token.startsWith("sb_publishable_")) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (payload.role === "service_role") return true;
  if (projectRef && typeof payload.ref === "string" && payload.ref !== projectRef) return true;
  if (payload.role !== undefined && payload.role !== "anon") return true;
  return false;
}

export async function defaultValidateProjectApiKey(
  supabaseUrl: string,
  apiKey: string,
): Promise<boolean> {
  const base = supabaseUrl.trim().replace(/\/$/, "");
  if (!base.startsWith("http")) return false;
  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

export async function authenticateRadarHistoricalContextRequest(input: {
  supabaseUrl: string;
  authorizationHeader: string | null;
  apikeyHeader: string | null;
  anonKey: string;
  publishableKey: string;
  getUser: (authorizationHeader: string) => Promise<{ userId: string | null }>;
  validateApiKey?: ValidateProjectApiKey;
}): Promise<RadarHistoricalContextAuth | null> {
  const authHeader = input.authorizationHeader?.trim() ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) return null;

  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return null;

  const configuredKeys = collectConfiguredProjectApiKeys({
    anonKey: input.anonKey,
    publishableKey: input.publishableKey,
  });
  const gatewayKey = configuredKeys[0] ?? "";
  if (!gatewayKey) return null;

  const apikeyHeader = input.apikeyHeader?.trim() ?? "";
  if (apikeyHeader && apikeyHeader !== bearer && !configuredKeys.includes(apikeyHeader)) {
    return null;
  }

  const user = await input.getUser(authHeader);
  if (user.userId) {
    return { mode: "user", authorizationHeader: authHeader };
  }

  const projectRef = projectRefFromSupabaseUrl(input.supabaseUrl);
  if (rejectsPublicCredentialShape(bearer, projectRef)) return null;

  const validate = input.validateApiKey ?? defaultValidateProjectApiKey;
  const configuredMatch = configuredKeys.includes(bearer);
  const gatewayValid = configuredMatch || await validate(input.supabaseUrl, bearer);
  if (!gatewayValid) return null;

  const payload = decodeJwtPayload(bearer);
  if (payload && payload.role !== "anon") return null;

  return { mode: "public" };
}
