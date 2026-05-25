import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function sicToSector(sic: number): string {
  if (!sic) return "";
  if (sic >= 100 && sic <= 999) return "Consumer Staples";
  if (sic >= 1000 && sic <= 1499) return "Materials";
  if (sic >= 1500 && sic <= 1799) return "Industrials";
  if (sic >= 2000 && sic <= 2111) return "Consumer Staples";
  if (sic >= 2830 && sic <= 2836) return "Healthcare";
  if (sic >= 2800 && sic <= 2999) return "Materials";
  if (sic >= 2200 && sic <= 3999) return "Industrials";
  if (sic === 3674) return "Technology";
  if (sic >= 3670 && sic <= 3679) return "Technology";
  if (sic >= 3570 && sic <= 3579) return "Technology";
  if (sic >= 3670 && sic <= 3699) return "Technology";
  if (sic >= 4000 && sic <= 4899) return "Industrials";
  if (sic >= 4900 && sic <= 4999) return "Utilities";
  if (sic >= 5000 && sic <= 5199) return "Industrials";
  if (sic >= 5200 && sic <= 5999) return "Consumer Discretionary";
  if (sic >= 6000 && sic <= 6199) return "Financials";
  if (sic >= 6200 && sic <= 6289) return "Financials";
  if (sic >= 6300 && sic <= 6399) return "Financials";
  if (sic >= 6500 && sic <= 6552) return "Real Estate";
  if (sic >= 6700 && sic <= 6726) return "Financials";
  if (sic >= 7000 && sic <= 7299) return "Consumer Discretionary";
  if (sic >= 7370 && sic <= 7379) return "Technology";
  if (sic >= 7200 && sic <= 7369) return "Consumer Discretionary";
  if (sic >= 7380 && sic <= 7999) return "Industrials";
  if (sic >= 8000 && sic <= 8099) return "Healthcare";
  if (sic >= 8100 && sic <= 8299) return "Financials";
  if (sic >= 8300 && sic <= 8999) return "Industrials";
  return "";
}

function toTitleCase(str: string): string {
  if (!str) return "";
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: rows, error: fetchError } = await supabase
    .from("stocks")
    .select("symbol")
    .or("sector.is.null,industry.is.null")
    .limit(100);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const tickers = (rows ?? []).map((r) => r.symbol);
  const total = tickers.length;
  let processed = 0;
  const errors = [];

  const BATCH_SIZE = 50;
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    for (const ticker of batch) {
      try {
        const res = await fetch(
          `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`
        );
        const json = await res.json();
        const result = json?.results;

        if (!result) {
          errors.push(`${ticker}: no results`);
          continue;
        }

        const sicCode = result.sic_code ? parseInt(result.sic_code, 10) : null;
        const sicDescription = result.sic_description ?? null;

        const newIndustry = sicDescription ? toTitleCase(sicDescription) : null;
        const newSector = sicCode ? sicToSector(sicCode) : null;

        const updatePayload = {};
        if (newIndustry) updatePayload.industry = newIndustry;
        if (newSector) updatePayload.sector = newSector;

        if (Object.keys(updatePayload).length > 0) {
          const { error: updateError } = await supabase
            .from("stocks")
            .update(updatePayload)
            .eq("symbol", ticker)
            .is("sector", null);

          if (updateError) {
            errors.push(`${ticker}: ${updateError.message}`);
          } else {
            processed++;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 120));
      } catch (e) {
        errors.push(`${ticker}: ${String(e)}`);
      }
    }
  }

  return new Response(
    JSON.stringify({ success: true, total, processed, errors: errors.slice(0, 20) }),
    { headers: { "Content-Type": "application/json" } }
  );
});
