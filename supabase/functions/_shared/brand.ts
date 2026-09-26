/**
 * Edge-function brand config — keep in sync with src/config/brand.ts (public app).
 */
import {
  buildNewsletterFromAddress,
  LEGACY_NEWSLETTER_SEND_DOMAIN,
  resendNewsletterEnvelope,
  TARGET_STOCKSIST_SEND_DOMAIN,
} from "./email/sender-config.ts";

export const BRAND = {
  name: "Stocksist",
  domain: "stocksist.com",
  displayDomain: "Stocksist.com",
  url: "https://stocksist.com",
  initials: "S",
  tagline: "Your Edge In Every Market",
  supportEmail: "info@stocksist.com",
  aiProductName: "Stocksist AI",
} as const;

export {
  buildNewsletterFromAddress,
  LEGACY_NEWSLETTER_SEND_DOMAIN,
  resendNewsletterEnvelope,
  TARGET_STOCKSIST_SEND_DOMAIN,
};

/** @deprecated Prefer resendNewsletterEnvelope(Deno.env.toObject()) in edge functions. */
export function newsletterFromAddress(
  displayName = `${BRAND.name} Market Bullets`,
): string {
  return buildNewsletterFromAddress({}, displayName);
}
