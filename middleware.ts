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

function injectMeta(html: string, title: string, description: string): string {
  const ogImage = "https://hedgefun.fun/og-share-card.png";

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}">`);
  html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${ogImage}">`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}">`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}">`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}">`);

  return html;
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

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

  try {
    const indexUrl = new URL("/", request.url).toString();
    const response = await fetch(indexUrl);
    let html = await response.text();
    html = injectMeta(html, meta.title, meta.description);

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new Response(null, { status: 200 });
  }
}
