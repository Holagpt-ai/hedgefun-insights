import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.polygon.io";
const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function polyUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function fetchSafe(url: string): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`Fetch failed ${res.status}`);
      return { results: [] };
    }
    return await res.json();
  } catch (err) {
    console.error(`Fetch error:`, err);
    return { results: [] };
  }
}

async function fetchAllPages(initialUrl: string, maxPages = 10): Promise<any[]> {
  const all: any[] = [];
  let url: string | null = initialUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    pages++;
    const json = await fetchSafe(url);
    const results = json.results ?? [];
    all.push(...results);
    url = json.next_url ? `${json.next_url}&apiKey=${API_KEY}` : null;
    if (url) await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const __auth = req.headers.get("Authorization") ?? "";
  if (!SUPABASE_SERVICE_KEY || __auth !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const oneYearAgoStr = oneYearAgo.toISOString().split("T")[0];

  // Fetch all IPO statuses with pagination
  const [pendingResults, newResults, historyResults, rumorResults, withdrawnResults] = await Promise.all([
    fetchAllPages(polyUrl("/vX/reference/ipos", { ipo_status: "pending", limit: "250", order: "asc", sort: "listing_date" }), 5),
    fetchAllPages(polyUrl("/vX/reference/ipos", { ipo_status: "new", limit: "250", order: "desc", sort: "listing_date" }), 5),
    fetchAllPages(polyUrl("/vX/reference/ipos", { ipo_status: "history", listing_date_gte: oneYearAgoStr, limit: "250", order: "desc", sort: "listing_date" }), 10),
    fetchAllPages(polyUrl("/vX/reference/ipos", { ipo_status: "rumor", limit: "250", order: "asc", sort: "listing_date" }), 5),
    fetchAllPages(polyUrl("/vX/reference/ipos", { ipo_status: "withdrawn", limit: "250", order: "desc", sort: "listing_date" }), 5),
  ]);

  console.log("API counts - pending:", pendingResults.length, "new:", newResults.length, "history:", historyResults.length, "rumor:", rumorResults.length, "withdrawn:", withdrawnResults.length);

  const mapStatus = (s: string): string => {
    if (s === "pending" || s === "rumor") return "upcoming";
    if (s === "new" || s === "history") return "recent";
    if (s === "withdrawn") return "withdrawn";
    return s;
  };

  const mapIPO = (r: any) => {
    const status = mapStatus(r.ipo_status ?? "");
    return {
      symbol: r.ticker ?? null,
      name: r.issuer_name ?? r.name ?? "Unknown",
      ipo_date: r.listing_date ?? r.announced_date ?? null,
      price_range:
        r.lowest_offer_price && r.highest_offer_price
          ? `$${r.lowest_offer_price} - $${r.highest_offer_price}`
          : null,
      offer_price: r.final_issue_price ?? r.highest_offer_price ?? null,
      status,
      exchange: r.primary_exchange ?? null,
    };
  };

  const allRaw = [...pendingResults, ...rumorResults, ...newResults, ...historyResults, ...withdrawnResults];

  // Deduplicate by ticker (keep first occurrence — pending/rumor priority over history)
  const seen = new Set<string>();
  const rows = allRaw
    .map(mapIPO)
    .filter((r) => r.name && r.name !== "Unknown" && r.ipo_date)
    .filter((r) => {
      if (!r.symbol) return true; // keep all symbol-less
      if (seen.has(r.symbol)) return false;
      seen.add(r.symbol);
      return true;
    });

  console.log("Rows prepared:", rows.length);

  let inserted = 0;
  let errors = 0;

  const withSymbol = rows.filter((r) => r.symbol);
  const withoutSymbol = rows.filter((r) => !r.symbol);

  // Bulk upsert in chunks for symbol rows
  for (let i = 0; i < withSymbol.length; i += 200) {
    const chunk = withSymbol.slice(i, i + 200);
    const { error } = await supabase.from("ipo_list").upsert(chunk, { onConflict: "symbol" });
    if (error) {
      console.error("Bulk upsert error:", error.message);
      errors += chunk.length;
    } else {
      inserted += chunk.length;
    }
  }

  for (const row of withoutSymbol) {
    const { error } = await supabase.from("ipo_list").insert(row);
    if (error) errors++;
    else inserted++;
  }

  // Cleanup: only purge upcoming rows that are now in the past (their date passed without being relisted)
  await supabase.from("ipo_list").delete().eq("status", "upcoming").lt("ipo_date", todayStr).not("ipo_date", "is", null);

  const BAD_TICKERS = ["RDDT", "CRWV", "CBRS", "DBX2", "STRP", "NOTI", "ICRT", "EPIC"];
  await supabase.from("ipo_list").delete().in("symbol", BAD_TICKERS).eq("status", "recent");

  return new Response(
    JSON.stringify({
      synced: inserted,
      errors,
      counts: {
        pending: pendingResults.length,
        rumor: rumorResults.length,
        new: newResults.length,
        history: historyResults.length,
        withdrawn: withdrawnResults.length,
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
