import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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
      `https://api.massive.com/v2/reference/news?limit=20&order=desc&apiKey=${API_KEY}`
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
