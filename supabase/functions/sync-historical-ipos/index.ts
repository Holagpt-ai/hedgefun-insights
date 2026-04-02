import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let totalInserted = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // Fetch pages for 2024-2025
  const ranges = [
    { gte: "2024-01-01", lte: "2024-12-31" },
    { gte: "2025-01-01", lte: "2025-12-31" },
  ];

  for (const range of ranges) {
    let url: string | null =
      `https://api.polygon.io/vX/reference/ipos?listing_date.gte=${range.gte}&listing_date.lte=${range.lte}&limit=1000&order=asc&sort=listing_date&apiKey=${API_KEY}`;

    while (url) {
      console.log(`Fetching: ${url.replace(API_KEY, "***")}`);
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) {
          console.error(`API error ${res.status}`);
          break;
        }
        const json = await res.json();
        const results = json.results ?? [];
        console.log(`Got ${results.length} results for ${range.gte}-${range.lte}`);

        for (const r of results) {
          const symbol = r.ticker ?? null;
          const name = r.issuer_name ?? r.company_name ?? r.name ?? null;
          const ipoDate = r.listing_date ?? r.announced_date ?? null;

          if (!name || !ipoDate) {
            totalSkipped++;
            continue;
          }

          const row: Record<string, unknown> = {
            name,
            ipo_date: ipoDate,
            offer_price: r.final_issue_price ?? r.highest_offer_price ?? null,
            price_range:
              r.lowest_offer_price && r.highest_offer_price
                ? `$${r.lowest_offer_price} - $${r.highest_offer_price}`
                : null,
            status: "recent",
            exchange: r.primary_exchange ?? null,
            symbol,
          };

          if (symbol) {
            const { error } = await supabase
              .from("ipo_list")
              .upsert(row, { onConflict: "symbol" });
            if (error) {
              console.error(`Upsert error ${symbol}: ${error.message}`);
              totalErrors++;
            } else {
              totalInserted++;
            }
          } else {
            const { error } = await supabase.from("ipo_list").insert(row);
            if (error) {
              console.error(`Insert error ${name}: ${error.message}`);
              totalErrors++;
            } else {
              totalInserted++;
            }
          }
        }

        url = json.next_url ? `${json.next_url}&apiKey=${API_KEY}` : null;
      } catch (err) {
        console.error(`Fetch error: ${err}`);
        break;
      }
    }
  }

  const result = { inserted: totalInserted, errors: totalErrors, skipped: totalSkipped };
  console.log("Done:", result);

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
