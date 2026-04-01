import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { ticker, from, to } = await req.json();
  if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker.toUpperCase()}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=365&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  return new Response(JSON.stringify(json.results ?? []), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
