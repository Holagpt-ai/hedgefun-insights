import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

const delayLower = PUBLIC_MARKET_DATA_DELAY_DISCLOSURE.toLowerCase();

/** Homepage hero + i18n — must not imply live/real-time public quotes (ISS-038). */
export const PUBLIC_HERO_SUBTITLE = {
  en: `Research stocks, news, and fundamentals. Public quotes use ${delayLower}.`,
  es: `Investiga acciones, noticias y fundamentales. Las cotizaciones públicas usan datos de mercado con retraso de 15 minutos.`,
} as const;

/**
 * 23×5-style positioning: premarket, RTH, after-hours only — not overnight product claims.
 */
export const PUBLIC_EXTENDED_HOURS_POSITIONING =
  "Signed-in session tools cover U.S. premarket (4:00–9:30 AM ET), regular (9:30 AM–4:00 PM ET), and after-hours (4:00–8:00 PM ET). Overnight scanning is not active.";

export function publicInstrumentListDelayBlurb(): string {
  return `Keep track of your favorite symbols using ${delayLower} on public pages.`;
}

/** Plan marketing bullets — same delayed-data policy as public surfaces (ISS-038). */
export const SUBSCRIPTION_MARKET_DATA_FEATURE =
  "15-minute delayed market data (Stocksist research policy)";

export const PRO_SUBSCRIPTION_FEATURE_BULLETS = [
  SUBSCRIPTION_MARKET_DATA_FEATURE,
  "Unlimited watchlist",
  "All screener filters",
  "Analyst ratings & top stocks",
  "Up to 30 years financial history",
] as const;