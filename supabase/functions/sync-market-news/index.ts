import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY")!;

    const categories = ["general", "forex", "crypto", "merger"] as const;
    const categoryMap: Record<string, string> = {
      general: "markets",
      forex: "general",
      crypto: "general",
      merger: "stocks",
    };

    const allRows: any[] = [];

    for (const cat of categories) {
      const url = `https://finnhub.io/api/v1/news?category=${cat}&minId=0&token=${FINNHUB_KEY}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const items: any[] = await res.json();
      for (const item of items) {
        if (!item.headline || !item.url) continue;
        allRows.push({
          headline: item.headline,
          source: item.source ?? null,
          url: item.url,
          category: categoryMap[cat] ?? "general",
          published_at: item.datetime
            ? new Date(item.datetime * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    }

    const seen = new Set<string>();
    const deduped = allRows.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    let upserted = 0;
    const batchSize = 50;
    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      const { error } = await sb
        .from("market_news")
        .upsert(batch, { onConflict: "url", ignoreDuplicates: true });
      if (error) {
        console.error("upsert error:", error);
        continue;
      }
      upserted += batch.length;
    }

    return new Response(JSON.stringify({ ok: true, fetched: allRows.length, upserted }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-market-news error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
