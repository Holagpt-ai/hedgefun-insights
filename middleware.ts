// middleware.ts
export const config = {
  matcher: [
    "/stocks/:ticker*",
    "/etf/:ticker*",
    "/screener",
    "/earnings",
    "/ipos",
    "/news",
  ],
};

const STATIC_META: Record<string, { title: string; description: string }> = {
  "/screener": {
    title: "Stock Screener — Filter & Find Stocks | HedgeFun",
    description: "Screen and filter thousands of stocks by price, volume, market cap, sector, and more on HedgeFun.",
  },
  "/earnings": {
    title: "Earnings Calendar — Upcoming & Recent Reports | HedgeFun",
    description: "Track upcoming and recent earnings reports, EPS estimates, and actual results for US stocks on HedgeFun.",
  },
  "/ipos": {
    title: "IPO Calendar 2026 — Upcoming & Recent IPOs | HedgeFun",
    description: "Track upcoming and recent IPOs, expected offer prices, listing dates, and post-IPO performance on HedgeFun.",
  },
  "/news": {
    title: "Stock Market News & Financial Analysis | HedgeFun",
    description: "Get the latest stock market news, earnings coverage, economic updates, and financial analysis on HedgeFun.",
  },
  "/etf": {
    title: "ETF List — All ETF Symbols & Prices | HedgeFun",
    description: "Browse all US-listed ETFs with real-time prices, performance, holdings, and sector data on HedgeFun.",
  },
};

// --- UPDATED: accepts optional companyName ---
function buildStockMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} Stock Price, News & Analysis | HedgeFun`,
    description: `Get the latest ${label} stock price, news, financials, analyst ratings, and market analysis on HedgeFun.`,
  };
}

// --- UPDATED: accepts optional companyName ---
function buildEtfMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} ETF — Price & Holdings | HedgeFun`,
    description: `Get the latest ${label} ETF price, performance, holdings, sector breakdown, and news on HedgeFun.`,
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

// --- NEW: Supabase ticker_search lookup ---
async function getCompanyName(ticker: string): Promise<string | null> {
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
      }
    );
    if (!res.ok) return null;
    const rows = await res.json() as { name: string }[];
    return rows?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

function buildHtml(
  title: string,
  description: string,
  canonicalUrl: string,
  js: string,
  css: string
): string {
  const ogImage = "https://hedgefun.fun/og-share-card.png";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="module" crossorigin src="${js}"></script>
    <link rel="stylesheet" crossorigin href="${css}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const canonicalUrl = `https://hedgefun.fun${pathname}`;

  let meta: { title: string; description: string } | null = null;

  if (pathname.startsWith("/stocks/")) {
    const ticker = pathname.replace("/stocks/", "").split("/")[0];
    if (ticker) {
      // --- UPDATED: parallel fetch assets + company name ---
      const [{ js, css }, companyName] = await Promise.all([
        getAssets(url.origin),
        getCompanyName(ticker.toUpperCase()),
      ]);
      meta = buildStockMeta(ticker, companyName);
      const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }
  } else if (pathname.startsWith("/etf/") && pathname.length > 5) {
    const ticker = pathname.replace("/etf/", "").split("/")[0];
    if (ticker) {
      // --- UPDATED: parallel fetch assets + company name ---
      const [{ js, css }, companyName] = await Promise.all([
        getAssets(url.origin),
        getCompanyName(ticker.toUpperCase()),
      ]);
      meta = buildEtfMeta(ticker, companyName);
      const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }
  } else {
    meta = STATIC_META[pathname] ?? null;
  }

  if (!meta) return new Response(null, { status: 200 });

  const { js, css } = await getAssets(url.origin);
  const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}// middleware.ts
export const config = {
  matcher: [
    "/stocks/:ticker*",
    "/etf/:ticker*",
    "/screener",
    "/earnings",
    "/ipos",
    "/news",
  ],
};

const STATIC_META: Record<string, { title: string; description: string }> = {
  "/screener": {
    title: "Stock Screener — Filter & Find Stocks | HedgeFun",
    description: "Screen and filter thousands of stocks by price, volume, market cap, sector, and more on HedgeFun.",
  },
  "/earnings": {
    title: "Earnings Calendar — Upcoming & Recent Reports | HedgeFun",
    description: "Track upcoming and recent earnings reports, EPS estimates, and actual results for US stocks on HedgeFun.",
  },
  "/ipos": {
    title: "IPO Calendar 2026 — Upcoming & Recent IPOs | HedgeFun",
    description: "Track upcoming and recent IPOs, expected offer prices, listing dates, and post-IPO performance on HedgeFun.",
  },
  "/news": {
    title: "Stock Market News & Financial Analysis | HedgeFun",
    description: "Get the latest stock market news, earnings coverage, economic updates, and financial analysis on HedgeFun.",
  },
  "/etf": {
    title: "ETF List — All ETF Symbols & Prices | HedgeFun",
    description: "Browse all US-listed ETFs with real-time prices, performance, holdings, and sector data on HedgeFun.",
  },
};

// --- UPDATED: accepts optional companyName ---
function buildStockMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} Stock Price, News & Analysis | HedgeFun`,
    description: `Get the latest ${label} stock price, news, financials, analyst ratings, and market analysis on HedgeFun.`,
  };
}

// --- UPDATED: accepts optional companyName ---
function buildEtfMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} ETF — Price & Holdings | HedgeFun`,
    description: `Get the latest ${label} ETF price, performance, holdings, sector breakdown, and news on HedgeFun.`,
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

// --- NEW: Supabase ticker_search lookup ---
async function getCompanyName(ticker: string): Promise<string | null> {
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
      }
    );
    if (!res.ok) return null;
    const rows = await res.json() as { name: string }[];
    return rows?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

function buildHtml(
  title: string,
  description: string,
  canonicalUrl: string,
  js: string,
  css: string
): string {
  const ogImage = "https://hedgefun.fun/og-share-card.png";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="module" crossorigin src="${js}"></script>
    <link rel="stylesheet" crossorigin href="${css}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const canonicalUrl = `https://hedgefun.fun${pathname}`;

  let meta: { title: string; description: string } | null = null;

  if (pathname.startsWith("/stocks/")) {
    const ticker = pathname.replace("/stocks/", "").split("/")[0];
    if (ticker) {
      // --- UPDATED: parallel fetch assets + company name ---
      const [{ js, css }, companyName] = await Promise.all([
        getAssets(url.origin),
        getCompanyName(ticker.toUpperCase()),
      ]);
      meta = buildStockMeta(ticker, companyName);
      const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }
  } else if (pathname.startsWith("/etf/") && pathname.length > 5) {
    const ticker = pathname.replace("/etf/", "").split("/")[0];
    if (ticker) {
      // --- UPDATED: parallel fetch assets + company name ---
      const [{ js, css }, companyName] = await Promise.all([
        getAssets(url.origin),
        getCompanyName(ticker.toUpperCase()),
      ]);
      meta = buildEtfMeta(ticker, companyName);
      const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }
  } else {
    meta = STATIC_META[pathname] ?? null;
  }

  if (!meta) return new Response(null, { status: 200 });

  const { js, css } = await getAssets(url.origin);
  const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}// middleware.ts
export const config = {
  matcher: [
    "/stocks/:ticker*",
    "/etf/:ticker*",
    "/screener",
    "/earnings",
    "/ipos",
    "/news",
  ],
};

const STATIC_META: Record<string, { title: string; description: string }> = {
  "/screener": {
    title: "Stock Screener — Filter & Find Stocks | HedgeFun",
    description: "Screen and filter thousands of stocks by price, volume, market cap, sector, and more on HedgeFun.",
  },
  "/earnings": {
    title: "Earnings Calendar — Upcoming & Recent Reports | HedgeFun",
    description: "Track upcoming and recent earnings reports, EPS estimates, and actual results for US stocks on HedgeFun.",
  },
  "/ipos": {
    title: "IPO Calendar 2026 — Upcoming & Recent IPOs | HedgeFun",
    description: "Track upcoming and recent IPOs, expected offer prices, listing dates, and post-IPO performance on HedgeFun.",
  },
  "/news": {
    title: "Stock Market News & Financial Analysis | HedgeFun",
    description: "Get the latest stock market news, earnings coverage, economic updates, and financial analysis on HedgeFun.",
  },
  "/etf": {
    title: "ETF List — All ETF Symbols & Prices | HedgeFun",
    description: "Browse all US-listed ETFs with real-time prices, performance, holdings, and sector data on HedgeFun.",
  },
};

// --- UPDATED: accepts optional companyName ---
function buildStockMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} Stock Price, News & Analysis | HedgeFun`,
    description: `Get the latest ${label} stock price, news, financials, analyst ratings, and market analysis on HedgeFun.`,
  };
}

// --- UPDATED: accepts optional companyName ---
function buildEtfMeta(ticker: string, companyName: string | null) {
  const t = ticker.toUpperCase();
  const label = companyName ? `${companyName} (${t})` : t;
  return {
    title: `${label} ETF — Price & Holdings | HedgeFun`,
    description: `Get the latest ${label} ETF price, performance, holdings, sector breakdown, and news on HedgeFun.`,
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

// --- NEW: Supabase ticker_search lookup ---
async function getCompanyName(ticker: string): Promise<string | null> {
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
      }
    );
    if (!res.ok) return null;
    const rows = await res.json() as { name: string }[];
    return rows?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

function buildHtml(
  title: string,
  description: string,
  canonicalUrl: string,
  js: string,
  css: string
): string {
  const ogImage = "https://hedgefun.fun/og-share-card.png";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="module" crossorigin src="${js}"></script>
    <link rel="stylesheet" crossorigin href="${css}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const canonicalUrl = `https://hedgefun.fun${pathname}`;

  let meta: { title: string; description: string } | null = null;

  if (pathname.startsWith("/stocks/")) {
    const ticker = pathname.replace("/stocks/", "").split("/")[0];
    if (ticker) {
      // --- UPDATED: parallel fetch assets + company name ---
      const [{ js, css }, companyName] = await Promise.all([
        getAssets(url.origin),
        getCompanyName(ticker.toUpperCase()),
      ]);
      meta = buildStockMeta(ticker, companyName);
      const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }
  } else if (pathname.startsWith("/etf/") && pathname.length > 5) {
    const ticker = pathname.replace("/etf/", "").split("/")[0];
    if (ticker) {
      // --- UPDATED: parallel fetch assets + company name ---
      const [{ js, css }, companyName] = await Promise.all([
        getAssets(url.origin),
        getCompanyName(ticker.toUpperCase()),
      ]);
      meta = buildEtfMeta(ticker, companyName);
      const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }
  } else {
    meta = STATIC_META[pathname] ?? null;
  }

  if (!meta) return new Response(null, { status: 200 });

  const { js, css } = await getAssets(url.origin);
  const html = buildHtml(meta.title, meta.description, canonicalUrl, js, css);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
