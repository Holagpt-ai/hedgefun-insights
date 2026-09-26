/**
 * Single public brand source for the Vite app.
 * Edge functions mirror values in supabase/functions/_shared/brand.ts.
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
  scoreName: "Opportunity Score",
  appDescription: "AI-powered stock market intelligence workspace",
} as const;
