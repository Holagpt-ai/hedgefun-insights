/**
 * Resend sender configuration (provider-neutral, env-driven).
 *
 * Rollout (no code deploy required for rollback):
 * 1. Verify DNS for send.stocksist.com in Resend (external).
 * 2. Send a test from staging with NEWSLETTER_SEND_DOMAIN=send.stocksist.com.
 * 3. Set NEWSLETTER_SEND_DOMAIN on production Supabase secrets.
 * 4. Rollback: unset NEWSLETTER_SEND_DOMAIN or set NEWSLETTER_FORCE_LEGACY_SEND=true.
 */

/** Recommended production subdomain once verified in Resend — not active until env is set. */
export const TARGET_STOCKSIST_SEND_DOMAIN = "send.stocksist.com";

/** Verified Resend domain in production today. */
export const LEGACY_NEWSLETTER_SEND_DOMAIN = "send.hedgefun.fun";

const DEFAULT_LOCAL_PART = "newsletter";
const DEFAULT_DISPLAY_NAME = "Stocksist Market Bullets";
const DEFAULT_REPLY_TO = "info@stocksist.com";

export type NewsletterSenderEnv = Record<string, string | undefined>;

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

function legacySendDomain(env: NewsletterSenderEnv): string {
  const override = env.NEWSLETTER_LEGACY_SEND_DOMAIN?.trim();
  return normalizeDomain(override || LEGACY_NEWSLETTER_SEND_DOMAIN);
}

/** Active Resend send domain: env override → legacy fallback (never empty). */
export function resolveNewsletterSendDomain(env: NewsletterSenderEnv): string {
  if (env.NEWSLETTER_FORCE_LEGACY_SEND === "true") {
    return legacySendDomain(env);
  }
  const configured = env.NEWSLETTER_SEND_DOMAIN?.trim();
  if (configured) return normalizeDomain(configured);
  return legacySendDomain(env);
}

export function resolveNewsletterLocalPart(env: NewsletterSenderEnv): string {
  const part = env.NEWSLETTER_SEND_LOCAL_PART?.trim();
  return part && /^[a-z0-9._-]+$/i.test(part) ? part : DEFAULT_LOCAL_PART;
}

export function resolveNewsletterDisplayName(
  env: NewsletterSenderEnv,
  displayNameOverride?: string,
): string {
  if (displayNameOverride?.trim()) return displayNameOverride.trim();
  const fromEnv = env.NEWSLETTER_FROM_DISPLAY_NAME?.trim();
  return fromEnv || DEFAULT_DISPLAY_NAME;
}

export function resolveNewsletterReplyTo(env: NewsletterSenderEnv): string | undefined {
  const fromEnv = env.NEWSLETTER_REPLY_TO?.trim();
  if (fromEnv && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEnv)) return fromEnv;
  return DEFAULT_REPLY_TO;
}

export function buildFromAddress(input: {
  displayName: string;
  localPart: string;
  sendDomain: string;
}): string {
  return `${input.displayName} <${input.localPart}@${input.sendDomain}>`;
}

export function buildNewsletterFromAddress(
  env: NewsletterSenderEnv,
  displayNameOverride?: string,
): string {
  return buildFromAddress({
    displayName: resolveNewsletterDisplayName(env, displayNameOverride),
    localPart: resolveNewsletterLocalPart(env),
    sendDomain: resolveNewsletterSendDomain(env),
  });
}

export interface ResendNewsletterEnvelope {
  from: string;
  reply_to: string | undefined;
  send_domain: string;
  using_legacy_domain: boolean;
}

export function resendNewsletterEnvelope(
  env: NewsletterSenderEnv,
  displayNameOverride?: string,
): ResendNewsletterEnvelope {
  const send_domain = resolveNewsletterSendDomain(env);
  return {
    from: buildNewsletterFromAddress(env, displayNameOverride),
    reply_to: resolveNewsletterReplyTo(env),
    send_domain,
    using_legacy_domain: send_domain === legacySendDomain(env),
  };
}
