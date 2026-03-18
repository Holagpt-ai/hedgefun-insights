import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.polygon.io";

function polyUrl(path: string, params: Record<string, string> = {}): string {
  const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.error(`Polygon error ${res.status}: ${text}`);
    return null;
  }
  return res.json();
}

// Small delay to respect rate limits (5 req/min on free, 100/min on paid)
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!POLYGON_API_KEY) {
      throw new Error("POLYGON_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all stock symbols from the DB
    const { data: stocks, error: fetchErr } = await supabase
      .from("stocks")
      .select("symbol");
    if (fetchErr) throw fetchErr;

    const symbols = (stocks ?? []).map((s: { symbol: string }) => s.symbol);
    console.log(`Syncing ${symbols.length} stocks...`);

    let updated = 0;
    let errors = 0;

    // Process in batches of 5 to respect rate limits
    for (let i = 0; i < symbols.length; i += 5) {
      const batch = symbols.slice(i, i + 5);

      const results = await Promise.all(
        batch.map(async (symbol: string) => {
          try {
            // Fetch snapshot (price, change, volume) and details (market_cap, sector, etc.) in parallel
            const [snapshotJson, detailsJson] = await Promise.all([
              fetchJson(polyUrl(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`)),
              fetchJson(polyUrl(`/v3/reference/tickers/${symbol}`)),
            ]);

            const snap = snapshotJson?.ticker;
            const details = detailsJson?.results;

            if (!snap && !details) {
              console.warn(`No data for ${symbol}`);
              return null;
            }

            const updateData: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            };

            // From snapshot
            if (snap) {
              const day = snap.day ?? snap.prevDay ?? {};
              const todaysChange = snap.todaysChange;
              const todaysChangePerc = snap.todaysChangePerc;

              updateData.price = day.c ?? snap.lastTrade?.p ?? null;
              updateData.change_amount = todaysChange ?? null;
              updateData.change_percent = todaysChangePerc ?? null;
              updateData.volume = day.v ?? null;
            }

            // From details
            if (details) {
              updateData.name = details.name ?? undefined;
              updateData.market_cap = details.market_cap ? Math.round(details.market_cap) : null;
              updateData.sector = details.sic_description ?? null;
              updateData.industry = details.sic_description ?? null;
              updateData.description = details.description ?? null;
              updateData.website = details.homepage_url ?? null;
              updateData.logo_url = details.branding?.icon_url
                ? `${details.branding.icon_url}?apiKey=${POLYGON_API_KEY}`
                : null;
              updateData.exchange = details.primary_exchange ?? null;
            }

            // Remove undefined values
            Object.keys(updateData).forEach((k) => {
              if (updateData[k] === undefined) delete updateData[k];
            });

            return { symbol, updateData };
          } catch (err) {
            console.error(`Error fetching ${symbol}:`, err);
            return null;
          }
        })
      );

      // Batch update to Supabase
      for (const result of results) {
        if (!result) {
          errors++;
          continue;
        }
        const { error: updateErr } = await supabase
          .from("stocks")
          .update(result.updateData)
          .eq("symbol", result.symbol);

        if (updateErr) {
          console.error(`DB update error for ${result.symbol}:`, updateErr);
          errors++;
        } else {
          updated++;
        }
      }

      // Rate limit delay between batches
      if (i + 5 < symbols.length) {
        await delay(1200);
      }
    }

    console.log(`Sync complete: ${updated} updated, ${errors} errors`);

    return new Response(
      JSON.stringify({ success: true, updated, errors, total: symbols.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-stocks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
