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

function buildStockMeta(ticker: string) {
  const t = ticker.toUpperCase();
  return {
    title: `${t} Stock Price, News & Analysis | HedgeFun`,
    description: `Get the latest ${t} stock price, news, financials, analyst ratings, and market analysis on HedgeFun.`,
  };
}

function buildEtfMeta(ticker: string) {
  const t = ticker.toUpperCase();
  return {
    title: `${t} ETF — Price & Holdings | HedgeFun`,
    description: `Get the latest ${t} ETF price, performance, holdings, sector breakdown, and news on HedgeFun.`,
  };
}

function buildHtml(title: string, description: string, canonicalUrl: string): string {
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
    <script type="module" crossorigin src="/assets/index-CvPywv0l.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-KAwZanpy.css" />
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
    if (ticker) meta = buildStockMeta(ticker);
  } else if (pathname.startsWith("/etf/") && pathname.length > 5) {
    const ticker = pathname.replace("/etf/", "").split("/")[0];
    if (ticker) meta = buildEtfMeta(ticker);
  } else {
    meta = STATIC_META[pathname] ?? null;
  }

  if (!meta) return new Response(null, { status: 200 });

  const html = buildHtml(meta.title, meta.description, canonicalUrl);

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
