import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLYGON_BASE = "https://api.polygon.io";

function polyUrl(path: string, apiKey: string, params: Record<string, string> = {}): string {
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!POLYGON_API_KEY) throw new Error("POLYGON_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch all active stock symbols
    const { data: stocks, error: stocksErr } = await supabase
      .from("stocks")
      .select("symbol")
      .order("symbol");
    if (stocksErr) throw stocksErr;

    // 2. Fetch all active ETF symbols
    const { data: etfs, error: etfsErr } = await supabase
      .from("etfs")
      .select("symbol")
      .order("symbol");
    if (etfsErr) throw etfsErr;

    const stockSymbols = (stocks ?? []).map((r: any) => r.symbol);
    const etfSymbols = (etfs ?? []).map((r: any) => r.symbol);
    const now = new Date().toISOString();

    let stocksUpdated = 0;
    let etfsUpdated = 0;
    const errors: string[] = [];

    // 3. Batch-fetch stock snapshots (up to 50 at a time via grouped snapshot)
    const BATCH_SIZE = 50;
    for (let i = 0; i < stockSymbols.length; i += BATCH_SIZE) {
      const batch = stockSymbols.slice(i, i + BATCH_SIZE);
      const tickerParam = batch.join(",");

      try {
        const json = await fetchJson(
          polyUrl("/v2/snapshot/locale/us/markets/stocks/tickers", POLYGON_API_KEY, {
            tickers: tickerParam,
          })
        );

        const tickers = json.tickers ?? [];
        if (tickers.length === 0) continue;

        const rows = tickers.map((t: any) => ({
          symbol: t.ticker,
          price: t.day?.c > 0 ? t.day.c : (t.prevDay?.c ?? null),
          change_amount: t.todaysChange ?? null,
          change_percent: t.todaysChangePerc ?? null,
          volume: t.day?.v ?? null,
          updated_at: now,
        }));

        const { error: upsertErr } = await supabase
          .from("stocks")
          .upsert(rows, { onConflict: "symbol", ignoreDuplicates: false });

        if (upsertErr) {
          errors.push(`stocks batch ${i}: ${upsertErr.message}`);
        } else {
          stocksUpdated += rows.length;
        }
      } catch (e) {
        errors.push(`stocks batch ${i}: ${e.message}`);
      }

      // Rate-limit pause between batches
      if (i + BATCH_SIZE < stockSymbols.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // 4. Batch-fetch ETF snapshots
    for (let i = 0; i < etfSymbols.length; i += BATCH_SIZE) {
      const batch = etfSymbols.slice(i, i + BATCH_SIZE);
      const tickerParam = batch.join(",");

      try {
        const json = await fetchJson(
          polyUrl("/v2/snapshot/locale/us/markets/stocks/tickers", POLYGON_API_KEY, {
            tickers: tickerParam,
          })
        );

        const tickers = json.tickers ?? [];
        if (tickers.length === 0) continue;

        const rows = tickers.map((t: any) => ({
          symbol: t.ticker,
          price: t.day?.c > 0 ? t.day.c : (t.prevDay?.c ?? null),
          change_percent: t.todaysChangePerc ?? null,
          volume: t.day?.v ?? null,
          updated_at: now,
        }));

        const { error: upsertErr } = await supabase
          .from("etfs")
          .upsert(rows, { onConflict: "symbol", ignoreDuplicates: false });

        if (upsertErr) {
          errors.push(`etfs batch ${i}: ${upsertErr.message}`);
        } else {
          etfsUpdated += rows.length;
        }
      } catch (e) {
        errors.push(`etfs batch ${i}: ${e.message}`);
      }

      if (i + BATCH_SIZE < etfSymbols.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    console.log(`[refresh-market-data] stocks: ${stocksUpdated}, etfs: ${etfsUpdated}, errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        stocks_updated: stocksUpdated,
        etfs_updated: etfsUpdated,
        total_stock_symbols: stockSymbols.length,
        total_etf_symbols: etfSymbols.length,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: now,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[refresh-market-data] fatal:", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
