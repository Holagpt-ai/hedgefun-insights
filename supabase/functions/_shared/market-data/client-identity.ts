/**
 * Client identity for public market-data quota.
 *
 * Lovable Cloud / Supabase Edge does not document that it strips or
 * overwrites `cf-connecting-ip`, `x-forwarded-for`, or `x-real-ip` before
 * the function runs. A well-formed public IP in those headers is therefore
 * not a verified client.
 *
 * Per-IP limits stay off. Snapshot and aggregate protection is the shared
 * global Massive quota.
 */

export type MarketDataClientIdentity = {
  status: "unverified";
  reason: "gateway_trust_unconfirmed";
};

export function resolveMarketDataClientIdentity(_req: Request): MarketDataClientIdentity {
  return { status: "unverified", reason: "gateway_trust_unconfirmed" };
}
