import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MASSIVE_BASE = "https://api.polygon.io";

serve(async (req) => {

  // Restrict to service role / cron only
  const __auth = req.headers.get("Authorization") ?? "";
  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!__srk || __auth !== `Bearer ${__srk}`) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  try {
    const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!POLYGON_API_KEY) throw new Error("POLYGON_API_KEY not set");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch IPO-related news using ticker search for known IPO keywords
    const url = `${MASSIVE_BASE}/v2/reference/news?limit=30&order=desc&sort=published_utc&apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Massive API error ${res.status}: ${body}`);
    }

    const json = await res.json();
    const articles = json.results ?? [];

    // Filter for IPO-related articles by keyword matching
    const ipoKeywords = ["ipo", "initial public offering", "public offering", "goes public", "going public", "debut", "listing", "direct listing", "spac"];
    const ipoArticles = articles.filter((a: any) => {
      const text = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
      return ipoKeywords.some((kw) => text.includes(kw));
    });

    // Also fetch specifically with IPO search term
    const ipoUrl = `${MASSIVE_BASE}/v2/reference/news?limit=20&order=desc&sort=published_utc&apiKey=${POLYGON_API_KEY}&ticker=IPO`;
    const ipoRes = await fetch(ipoUrl);
    let ipoTickerArticles: any[] = [];
    if (ipoRes.ok) {
      const ipoJson = await ipoRes.json();
      ipoTickerArticles = ipoJson.results ?? [];
    } else {
      await ipoRes.text();
    }

    // Merge and deduplicate by article_url
    const allArticles = [...ipoArticles, ...ipoTickerArticles];
    const seen = new Set<string>();
    const unique = allArticles.filter((a: any) => {
      const url = a.article_url;
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });

    if (unique.length === 0) {
      // If no IPO-specific articles found, just insert the latest general news tagged as ipo
      // so the page has content
      const fallback = articles.slice(0, 10);
      const rows = fallback.map((a: any) => ({
        headline: a.title ?? "Untitled",
        source: a.publisher?.name ?? null,
        url: a.article_url ?? null,
        category: "ipo",
        published_at: a.published_utc ?? new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await sb.from("market_news").upsert(rows, { onConflict: "url" });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ ok: true, synced: rows.length, note: "fallback" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = unique.map((a: any) => ({
      headline: a.title ?? "Untitled",
      source: a.publisher?.name ?? null,
      url: a.article_url ?? null,
      category: "ipo",
      published_at: a.published_utc ?? new Date().toISOString(),
    }));

    const { error } = await sb.from("market_news").upsert(rows, { onConflict: "url" });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, synced: rows.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-ipo-news error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
