import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");

    let apiUrl = "";
    if (type === "dividends") {
      apiUrl = `https://api.polygon.io/vX/reference/dividends?limit=50&sort=ex_dividend_date&order=desc&apiKey=${POLYGON_API_KEY}`;
    } else if (type === "splits") {
      apiUrl = `https://api.polygon.io/vX/reference/splits?limit=50&sort=execution_date&order=desc&apiKey=${POLYGON_API_KEY}`;
    } else {
      return new Response(JSON.stringify({ error: "invalid type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
    const json = await res.json();

    return new Response(JSON.stringify(json.results ?? []), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
