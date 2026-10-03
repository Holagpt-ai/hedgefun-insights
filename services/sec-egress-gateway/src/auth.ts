// Credential check for the SEC egress gateway.
// Bearer comparison hashes both values before a fixed-length compare so the
// secret is not logged and the check can later sit beside an HMAC authenticator.

import { timingSafeEqual } from "node:crypto";

export type AuthResult =
  | { ok: true; scheme: "bearer" }
  | { ok: false; status: 401 | 403; reason: "missing" | "invalid" };

export interface GatewayAuthenticator {
  authenticate(request: Request): Promise<AuthResult>;
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

export function bearerAuthenticator(secret: string | undefined | null): GatewayAuthenticator {
  return {
    async authenticate(request: Request): Promise<AuthResult> {
      const header = request.headers.get("authorization") ?? "";
      const match = header.match(/^Bearer\s+(\S+)\s*$/i);
      if (!match) return { ok: false, status: 401, reason: "missing" };
      if (!secret) return { ok: false, status: 403, reason: "invalid" };
      const [presented, configured] = await Promise.all([sha256(match[1]), sha256(secret)]);
      if (!timingSafeEqual(presented, configured)) return { ok: false, status: 403, reason: "invalid" };
      return { ok: true, scheme: "bearer" };
    },
  };
}
