/**
 * Public SEO boundaries for the Stocksist Vite SPA (stocksist.com).
 *
 * Ownership split:
 * - Vite app: product UI, static/trust pages, ticker/ETF pages inside the SPA,
 *   robots.txt, Search Console HTML meta verification, dynamic sitemap via edge fn.
 * - Separate Next.js SEO stack (not in this repo): long-form programmatic SEO,
 *   marketing landing experiments, and primary content sitemap IF adopted later.
 *   Do not duplicate programmatic SEO pages in Vite.
 */

import { BRAND } from "@/config/brand";

export const CANONICAL_ORIGIN = BRAND.url;

/** Path prefixes that must not be indexed (robots + layout noindex). */
export const NOINDEX_PATH_PREFIXES = [
  "/dashboard",
  "/admin",
  "/account",
  "/auth",
  "/login",
  "/signup",
  "/register",
  "/sign-up",
  "/reset-password",
  "/unsubscribe",
  "/.lovable",
] as const;

/** Minimal public routes for static sitemap fallback (production uses edge /sitemap.xml). */
export const STATIC_SITEMAP_PATHS = [
  "/",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/disclaimer",
  "/faq",
  "/affiliates",
  "/pro",
  "/news",
  "/trending",
  "/screener",
  "/earnings",
  "/stocks",
  "/chart",
  "/tools",
  "/newsletter",
  "/markets/gainers",
  "/markets/losers",
  "/markets/active",
  "/markets/premarket",
  "/markets/after-hours",
  "/markets/heatmap",
  "/ipos/recent",
  "/ipos/calendar",
  "/ipos/statistics",
  "/ipos/news",
  "/etfs/screener",
  "/stocks/analysts",
  "/stocks/compare",
  "/stocks/lists",
  "/sitemap",
  "/methodology",
  "/articles",
] as const;

export function isNoindexPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return NOINDEX_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function canonicalUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path === "/") return `${CANONICAL_ORIGIN}/`;
  return `${CANONICAL_ORIGIN}${path.replace(/\/+$/, "") || ""}`;
}

export function pathAllowedInStaticSitemap(path: string): boolean {
  if (isNoindexPath(path)) return false;
  if (path.startsWith("/dashboard")) return false;
  if (path.startsWith("/watchlist")) return false;
  return STATIC_SITEMAP_PATHS.includes(path as (typeof STATIC_SITEMAP_PATHS)[number]);
}
