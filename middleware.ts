import { next } from "@vercel/functions";
import {
  CANONICAL_SITE_ORIGIN,
  MIDDLEWARE_PUBLIC_META,
  etfDetailSymbolFromPath,
  isNoindexPath,
  stockDetailSymbolFromPath,
} from "./seo-boundaries";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/auth/:path*",
    "/login",
    "/signup",
    "/register",
    "/sign-up",
    "/reset-password",
    "/unsubscribe",
    "/unsubscribe/:path*",
    "/journal",
    "/journal/:path*",
    "/stocks/:path*",
    "/etf/:path*",
    "/etfs/:path*",
    "/screener",
    "/earnings",
    "/ipos",
    "/ipos/:path*",
    "/news",
    "/trending",
    "/articles",
    "/articles/:path*",
    "/tools",
    "/tools/:path*",
    "/markets/:path*",
    "/about",
    "/contact",
    "/terms",
    "/privacy",
    "/disclaimer",
    "/faq",
    "/affiliates",
    "/pro",
    "/newsletter",
    "/chart",
    "/methodology",
    "/sitemap",
    "/etfs/screener",
    "/stocks/analysts",
    "/stocks/compare",
    "/stocks/lists",
  ],
};

const BRAND_NAME = "Stocksist";
const SITE_URL = CANONICAL_SITE_ORIGIN;
const OG_IMAGE_URL = `${SITE_URL}/og-share-card.png`;

function buildStockMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} Stock Price, News & Analysis | ${BRAND_NAME}`,
    description: `Get the latest ${label} stock price, news, financials, analyst ratings, and market analysis on ${BRAND_NAME}.`,
  };
}

function buildEtfMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} ETF — Price & Holdings | ${BRAND_NAME}`,
    description: `Get the latest ${label} ETF price, performance, holdings, sector breakdown, and news on ${BRAND_NAME}.`,
  };
}

async function getAssets(origin: string): Promise<{ js: string; css: string }> {
  try {
    const res = await fetch(`${origin}/asset-manifest.json`);
    if (res.ok) {
      const data = await res.json() as { js: string; css: string };
      if (data.js && data.css) return data;
    }
  } catch {
    // fall through to defaults
  }
  return {
    js: "/assets/index-CvPywv0l.js",
    css: "/assets/index-KAwZanpy.css",
  };
}

async function getCompanyName(ticker: string): Promise<string | null> {
  const supabaseKey = process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseKey) return null;

  try {
    const res = await fetch(
      `https://zcjptaolpumhtlwhlemq.supabase.co/rest/v1/ticker_search?select=name&symbol=eq.${encodeURIComponent(ticker)}&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!res.ok) return null;
    const rows = await res.json() as { name: string }[];
    return rows?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** Metadata-first HTML shell for crawlers; SPA hydrates client-side content. */
function buildHtml(options: {
  title: string;
  description: string;
  canonicalUrl?: string | null;
  robotsNoindex?: boolean;
  js: string;
  css: string;
}): string {
  const title = escapeHtml(options.title);
  const description = escapeHtml(options.description);
  const ogImage = OG_IMAGE_URL;
  const canonical = options.canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(options.canonicalUrl)}" />`
    : "";
  const robots = options.robotsNoindex
    ? `<meta name="robots" content="noindex,nofollow" />`
    : "";
  const ogUrl = options.canonicalUrl
    ? `<meta property="og:url" content="${escapeHtml(options.canonicalUrl)}" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${robots}
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:type" content="website" />
    ${ogUrl}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    ${canonical}
    <script type="module" crossorigin src="${options.js}"></script>
    <link rel="stylesheet" crossorigin href="${options.css}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

function htmlResponse(html: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
      ...extraHeaders,
    },
  });
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (isNoindexPath(pathname)) {
    const { js, css } = await getAssets(url.origin);
    const html = buildHtml({
      title: `${BRAND_NAME}`,
      description: "Private Stocksist account area.",
      robotsNoindex: true,
      canonicalUrl: null,
      js,
      css,
    });
    return htmlResponse(html, { "X-Robots-Tag": "noindex, nofollow" });
  }

  const stockSymbol = stockDetailSymbolFromPath(pathname);
  if (stockSymbol) {
    const canonicalUrl = `${SITE_URL}/stocks/${stockSymbol}`;
    const [{ js, css }, companyName] = await Promise.all([
      getAssets(url.origin),
      getCompanyName(stockSymbol),
    ]);
    const meta = buildStockMeta(stockSymbol, companyName);
    return htmlResponse(
      buildHtml({
        ...meta,
        canonicalUrl,
        js,
        css,
      }),
    );
  }

  const etfSymbol = etfDetailSymbolFromPath(pathname);
  if (etfSymbol) {
    const canonicalPath = pathname.startsWith("/etfs/")
      ? `/etfs/${etfSymbol}`
      : `/etf/${etfSymbol}`;
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    const [{ js, css }, companyName] = await Promise.all([
      getAssets(url.origin),
      getCompanyName(etfSymbol),
    ]);
    const meta = buildEtfMeta(etfSymbol, companyName);
    return htmlResponse(
      buildHtml({
        ...meta,
        canonicalUrl,
        js,
        css,
      }),
    );
  }

  const staticMeta = MIDDLEWARE_PUBLIC_META[pathname] ?? null;
  if (staticMeta) {
    const canonicalUrl = `${SITE_URL}${pathname.replace(/\/+$/, "") || "/"}`;
    const { js, css } = await getAssets(url.origin);
    return htmlResponse(
      buildHtml({
        ...staticMeta,
        canonicalUrl,
        js,
        css,
      }),
    );
  }

  return next();
}
