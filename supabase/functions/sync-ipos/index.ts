import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLYGON_BASE = "https://api.massive.com";
const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function polyUrl(
  path: string,
  params: Record<string, string> = {}
): string {
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function fetchSafe(url: string): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`Fetch failed ${res.status} for ${url}`);
      return { results: [] };
    }
    return await res.json();
  } catch (err) {
    console.error(`Fetch error for ${url}:`, err);
    return { results: [] };
  }
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let totalSynced = 0;

  // Massive IPO status values:
  // "pending"  = upcoming IPO, date announced
  // "rumor"    = rumored IPO, no confirmed date
  // "new"      = IPO'd today (listing day)
  // "history"  = already listed (historical)

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  // Fetch all IPO categories in parallel
  const [upcomingJson, rumorJson, recentJson, newJson] = await Promise.all([
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "pending", limit: "50", order: "asc", sort: "ipo_date",
    })),
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "rumor", limit: "50", order: "asc", sort: "ipo_date",
    })),
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "history", ipo_date_gte: ninetyDaysAgo,
      limit: "50", order: "desc", sort: "ipo_date",
    })),
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "new", limit: "20",
    })),
  ]);

  const upcomingResults = upcomingJson.results ?? [];
  const rumorResults = rumorJson.results ?? [];
  const recentResults = recentJson.results ?? [];
  const newResults = newJson.results ?? [];

  // Map all results to ipo_list table format
  const mapIPO = (r: any, status: string) => ({
    symbol: r.ticker ?? null,
    name: r.name ?? r.issuer_name ?? "Unknown",
    ipo_date: r.ipo_date ?? new Date().toISOString().split("T")[0],
    price_range: r.lowest_offer_price && r.highest_offer_price
      ? `$${r.lowest_offer_price} - $${r.highest_offer_price}`
      : null,
    offer_price: r.final_issue_price ?? r.highest_offer_price ?? null,
    status,
    exchange: r.primary_mic_code ?? r.listing_exchange ?? null,
  });

  const rows = [
    ...upcomingResults.map((r: any) => mapIPO(r, "upcoming")),
    ...rumorResults.map((r: any) => mapIPO(r, "upcoming")),
    ...newResults.map((r: any) => mapIPO(r, "recent")),
    ...recentResults.map((r: any) => mapIPO(r, "recent")),
  ].filter(r => r.name && r.name !== "Unknown");

  // Upsert into ipo_list table — use symbol as conflict key for rows that have one
  if (rows.length > 0) {
    // Split into rows with symbols (can upsert) and without (insert only)
    const withSymbol = rows.filter(r => r.symbol);
    const withoutSymbol = rows.filter(r => !r.symbol);

    if (withSymbol.length > 0) {
      const { error } = await supabase
        .from("ipo_list")
        .upsert(withSymbol, { onConflict: "symbol", ignoreDuplicates: false });
      if (error) console.error("Upsert error (with symbol):", error);
    }

    if (withoutSymbol.length > 0) {
      const { error } = await supabase
        .from("ipo_list")
        .insert(withoutSymbol);
      if (error) console.error("Insert error (without symbol):", error);
    }

    totalSynced = rows.length;
  }

  // Mark old "upcoming" records with past dates
  await supabase
    .from("ipo_list")
    .update({ status: "recent" })
    .eq("status", "upcoming")
    .lt("ipo_date", new Date().toISOString().split("T")[0]);

  return new Response(
    JSON.stringify({
      synced: totalSynced,
      upcoming: upcomingResults.length + rumorResults.length,
      recent: recentResults.length + newResults.length,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
