/**
 * Edge-function brand config — keep in sync with src/config/brand.ts (public app).
 */
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

/** Resend-verified sender domain until stocksist.com mail DNS is configured. */
export const LEGACY_NEWSLETTER_SEND_DOMAIN = "send.hedgefun.fun";

export function newsletterFromAddress(
  displayName = `${BRAND.name} Market Bullets`,
): string {
  return `${displayName} <newsletter@${LEGACY_NEWSLETTER_SEND_DOMAIN}>`;
}
