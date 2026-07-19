// Constant-time credential comparison for Edge Function auth guards.
// Strategy: SHA-256 both inputs to fixed 32-byte digests via crypto.subtle.digest,
// then compare digests with node:crypto timingSafeEqual (fixed-length inputs only).
// Never logs inputs, headers, or digests.

import { timingSafeEqual } from "node:crypto";

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest);
}

/**
 * Constant-time match of a presented credential against one configured secret.
 * Returns false when the configured secret is empty, null, or undefined.
 */
export async function timingSafeMatch(
  presented: string,
  configured: string | undefined | null,
): Promise<boolean> {
  if (!configured) return false;
  const [a, b] = await Promise.all([sha256(presented ?? ""), sha256(configured)]);
  return timingSafeEqual(a, b);
}

/**
 * Evaluates a presented credential against multiple configured secrets.
 * All comparisons execute via Promise.all with no short-circuiting;
 * booleans are combined only after every comparison completes.
 * Empty/absent configured entries contribute false.
 */
export async function timingSafeMatchAny(
  presented: string,
  configured: Array<string | undefined | null>,
): Promise<boolean> {
  const results = await Promise.all(
    configured.map((c) => timingSafeMatch(presented, c)),
  );
  return results.some(Boolean);
}
