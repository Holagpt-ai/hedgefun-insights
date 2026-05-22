import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }
  // Restrict to service role / cron only — accept either Bearer SRK or x-sync-secret header
  const __auth = req.headers.get("Authorization") ?? "";
  const __syncSecretHeader = req.headers.get("x-sync-secret") ?? "";
  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const __syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  if (!__srk && !__syncSecret) {
    return new Response(JSON.stringify({ error: "Server auth not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const __bearerOk = __srk !== "" && __auth === `Bearer ${__srk}`;
  const __syncOk = __syncSecret !== "" && __syncSecretHeader === __syncSecret;
  if (!__bearerOk && !__syncOk) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!API_KEY) throw new Error("POLYGON_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const res = await fetch(
      `https://api.polygon.io/v2/reference/news?limit=20&order=desc&apiKey=${API_KEY}`
    );
    const json = await res.json();
    const articles = json?.results ?? [];

    if (articles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No articles returned", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let inserted = 0;
    let errors = 0;

    for (const article of articles) {
      const row = {
        headline: article.title ?? "Untitled",
        source: article.publisher?.name ?? null,
        url: article.article_url ?? null,
        category: "markets",
        published_at: article.published_utc ?? new Date().toISOString(),
        image_url: article.image_url ?? null,
        description: article.description ?? null,
        publisher_favicon: article.publisher?.favicon_url ?? null,
      };

      if (!row.url) {
        errors++;
        continue;
      }

      const { error } = await supabase
        .from("market_news")
        .upsert(row, { onConflict: "url" });

      if (error) {
        console.error(`Upsert error:`, error.message);
        errors++;
      } else {
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, errors, total: articles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-news error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
