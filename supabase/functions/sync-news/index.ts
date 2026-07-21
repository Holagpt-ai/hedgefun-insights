import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeMatch } from "../_shared/timing-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEADLINE_CATEGORY_RULES: Array<{ patterns: string[]; category: string }> = [
  {
    category: "earnings",
    patterns: ["earnings", "eps", "quarterly results", "revenue beat", "revenue miss", "profit", "net income", "fiscal quarter", "q1", "q2", "q3", "q4", "full year results"],
  },
  {
    category: "ipo",
    patterns: ["ipo", "initial public offering", "spac", "direct listing", "goes public", "trading debut", "prospectus", "s-1"],
  },
  {
    category: "tech",
    patterns: ["nvidia", "artificial intelligence", " ai ", "semiconductor", "software", "cloud", "cybersecurity", "microsoft", "google", "apple", "meta ", "amazon", "chip", "data center", "machine learning"],
  },
  {
    category: "healthcare",
    patterns: ["fda", "drug", "biotech", "pharmaceutical", "clinical trial", "health", "medicare", "medicaid", "cancer", "vaccine", "therapy", "medical"],
  },
  {
    category: "energy",
    patterns: ["oil", "crude", "natural gas", "energy", "solar", "renewable", "chevron", "exxon", "opec", "refinery", "petroleum", "wind power", "electric vehicle", "ev "],
  },
  {
    category: "crypto",
    patterns: ["bitcoin", "ethereum", "crypto", "blockchain", "defi", "nft", "digital asset", "coinbase", "binance", "stablecoin"],
  },
  {
    category: "economy",
    patterns: ["federal reserve", "fed rate", "inflation", "interest rate", "gdp", "recession", "unemployment", "jobs report", "treasury yield", "cpi", "fomc", "jerome powell", "tariff", "trade war"],
  },
  {
    category: "finance",
    patterns: ["merger", "acquisition", "buyout", "hedge fund", "private equity", "ipo", "bond", "debt", "bank", "goldman", "jpmorgan", "morgan stanley", "credit", "loan", "dividend"],
  },
  {
    category: "real-estate",
    patterns: ["real estate", "reit", "housing", "mortgage", "home sales", "property", "commercial real estate"],
  },
];

function deriveCategory(title: string): string {
  const lower = ` ${title.toLowerCase()} `;
  for (const rule of HEADLINE_CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (lower.includes(pattern)) return rule.category;
    }
  }
  return "markets";
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }
  const __auth = req.headers.get("Authorization") ?? "";
  const __syncSecretHeader = req.headers.get("x-sync-secret") ?? "";
  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const __syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  if (!__srk && !__syncSecret) {
    return new Response(
      JSON.stringify({ error: "Server auth not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const [__bearerOk, __syncOk] = await Promise.all([
    timingSafeMatch(__auth, __srk ? `Bearer ${__srk}` : ""),
    timingSafeMatch(__syncSecretHeader, __syncSecret),
  ]);
  if (!__bearerOk && !__syncOk) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
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
      const title = article.title ?? "Untitled";
      const row = {
        headline: title,
        source: article.publisher?.name ?? null,
        url: article.article_url ?? null,
        category: deriveCategory(title),
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
