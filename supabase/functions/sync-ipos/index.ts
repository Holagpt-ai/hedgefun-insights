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

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split("T")[0];

  // Fetch all IPO categories in parallel
  const [upcomingJson, rumorJson, recentJson, newJson] = await Promise.all([
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "pending", limit: "50", order: "asc", sort: "listing_date",
    })),
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "rumor", limit: "50", order: "asc", sort: "listing_date",
    })),
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "history", listing_date_gte: ninetyDaysAgoStr,
      limit: "50", order: "desc", sort: "listing_date",
    })),
    fetchSafe(polyUrl("/vX/reference/ipos", {
      status: "new", limit: "20",
    })),
  ]);

  const upcomingResults = upcomingJson.results ?? [];
  const rumorResults = rumorJson.results ?? [];
  const recentResults = recentJson.results ?? [];
  const newResults = newJson.results ?? [];

  // STRICT client-side date filtering using listing_date
  const getDate = (r: any) => r.listing_date ?? r.announced_date ?? null;

  const validUpcomingResults = upcomingResults;
  const validRumorResults = rumorResults;

  const validRecentResults = recentResults.filter((r: any) => {
    const d = getDate(r);
    if (!d) return false;
    const ipoDate = new Date(d);
    return ipoDate >= ninetyDaysAgo && ipoDate <= today;
  });

  const validNewResults = newResults.filter((r: any) => {
    const d = getDate(r);
    if (!d) return false;
    const ipoDate = new Date(d);
    return ipoDate >= ninetyDaysAgo && ipoDate <= today;
  });

  // Map using correct Massive field names
  const mapIPO = (r: any, status: string) => ({
    symbol: r.ticker ?? null,
    name: r.issuer_name ?? r.name ?? "Unknown",
    ipo_date: r.listing_date ?? r.announced_date ?? todayStr,
    price_range: r.lowest_offer_price && r.highest_offer_price
      ? `$${r.lowest_offer_price} - $${r.highest_offer_price}`
      : null,
    offer_price: r.final_issue_price ?? r.highest_offer_price ?? null,
    status,
    exchange: r.primary_exchange ?? null,
  });

  const rows = [
    ...validUpcomingResults.map((r: any) => mapIPO(r, "upcoming")),
    ...validRumorResults.map((r: any) => mapIPO(r, "upcoming")),
    ...validNewResults.map((r: any) => mapIPO(r, "recent")),
    ...validRecentResults.map((r: any) => mapIPO(r, "recent")),
  ].filter(r => r.name && r.name !== "Unknown");

  if (rows.length > 0) {
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

  // Cleanup stale records
  await supabase.from("ipo_list").delete().eq("status", "recent").lt("ipo_date", ninetyDaysAgoStr);
  await supabase.from("ipo_list").delete().eq("status", "upcoming").lt("ipo_date", todayStr).not("ipo_date", "is", null);

  const BAD_TICKERS = ["RDDT", "CRWV", "CBRS", "DBX2", "STRP", "NOTI", "ICRT", "EPIC"];
  await supabase.from("ipo_list").delete().in("symbol", BAD_TICKERS).eq("status", "recent");

  return new Response(
    JSON.stringify({
      synced: totalSynced,
      upcoming: validUpcomingResults.length + validRumorResults.length,
      recent: validRecentResults.length + validNewResults.length,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
