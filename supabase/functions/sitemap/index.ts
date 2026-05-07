import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BASE = "https://hedgefun.fun";
const HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod?: string, changefreq = "weekly", priority = "0.5"): string {
  return `<url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: HEADERS });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "index";

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
  );

  const fnUrl = "https://hedgefun.fun/sitemap.xml";

  try {
    if (type === "index") {
      const children = ["main", "stocks", "etfs", "ipos"];
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${children.map((c) => `<sitemap><loc>${esc(fnUrl + "?type=" + c)}</loc></sitemap>`).join("\n")}\n</sitemapindex>`;
      return new Response(body, { headers: HEADERS });
    }

    if (type === "main") {
      const pages = [
        { path: "/", pri: "1.0", freq: "daily" },
        { path: "/about", pri: "0.6", freq: "monthly" },
        { path: "/contact", pri: "0.5", freq: "monthly" },
        { path: "/terms", pri: "0.3", freq: "yearly" },
        { path: "/privacy", pri: "0.3", freq: "yearly" },
        { path: "/disclaimer", pri: "0.3", freq: "yearly" },
        { path: "/faq", pri: "0.5", freq: "monthly" },
        { path: "/affiliates", pri: "0.4", freq: "monthly" },
        { path: "/pro", pri: "0.7", freq: "weekly" },
        { path: "/news", pri: "0.8", freq: "daily" },
        { path: "/trending", pri: "0.8", freq: "daily" },
        { path: "/screener", pri: "0.7", freq: "daily" },
        { path: "/earnings", pri: "0.7", freq: "daily" },
        { path: "/watchlist", pri: "0.5", freq: "weekly" },
        { path: "/stocks", pri: "0.8", freq: "daily" },
        { path: "/chart", pri: "0.6", freq: "weekly" },
        { path: "/tools", pri: "0.6", freq: "monthly" },
        { path: "/newsletter", pri: "0.5", freq: "monthly" },
        { path: "/markets/gainers", pri: "0.7", freq: "daily" },
        { path: "/markets/losers", pri: "0.7", freq: "daily" },
        { path: "/markets/active", pri: "0.7", freq: "daily" },
        { path: "/markets/premarket", pri: "0.7", freq: "daily" },
        { path: "/markets/after-hours", pri: "0.7", freq: "daily" },
        { path: "/markets/heatmap", pri: "0.7", freq: "daily" },
        { path: "/ipos/recent", pri: "0.6", freq: "daily" },
        { path: "/ipos/calendar", pri: "0.6", freq: "daily" },
        { path: "/ipos/statistics", pri: "0.5", freq: "weekly" },
        { path: "/ipos/news", pri: "0.6", freq: "daily" },
        { path: "/etf/screener", pri: "0.6", freq: "weekly" },
        { path: "/stocks/analysts", pri: "0.5", freq: "weekly" },
        { path: "/stocks/compare", pri: "0.6", freq: "weekly" },
        { path: "/stocks/lists", pri: "0.5", freq: "weekly" },
        { path: "/sitemap", pri: "0.3", freq: "monthly" },
      ];
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => urlEntry(BASE + p.path, undefined, p.freq, p.pri)).join("\n")}\n</urlset>`;
      return new Response(body, { headers: HEADERS });
    }

    if (type === "stocks") {
      let stocks: any[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await sb
          .from("stocks")
          .select("symbol, updated_at")
          .not("symbol", "is", null)
          .range(from, from + batchSize - 1);
        if (error || !data || data.length === 0) break;
        stocks = stocks.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      const urls = stocks.map((r) =>
        urlEntry(`${BASE}/stocks/${esc(r.symbol)}`, r.updated_at?.substring(0, 10), "daily", "0.7")
      );
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
      return new Response(body, { headers: HEADERS });
    }

    if (type === "etfs") {
      let etfs: any[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await sb
          .from("etfs")
          .select("symbol, updated_at")
          .not("symbol", "is", null)
          .range(from, from + batchSize - 1);
        if (error || !data || data.length === 0) break;
        etfs = etfs.concat(data);
        if (data.length < batchSize) break;
        from += batchSize;
      }
      const urls = etfs.map((r) =>
        urlEntry(`${BASE}/etf/${esc(r.symbol)}`, r.updated_at?.substring(0, 10), "weekly", "0.6")
      );
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
      return new Response(body, { headers: HEADERS });
    }

    if (type === "ipos") {
      const { data, error } = await sb.from("ipo_list").select("symbol, created_at").not("symbol", "is", null).order("ipo_date", { ascending: false });
      if (error) throw error;
      const urls = (data || []).filter((r) => r.symbol).map((r) =>
        urlEntry(`${BASE}/ipos/${esc(r.symbol!)}`, r.created_at?.substring(0, 10), "monthly", "0.4")
      );
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
      return new Response(body, { headers: HEADERS });
    }

    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, { headers: HEADERS });
  } catch (err) {
    console.error("Sitemap error:", err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- error generating sitemap --></urlset>`, { status: 500, headers: HEADERS });
  }
});
