import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeMatch } from "../_shared/timing-safe.ts";

const MASSIVE_BASE = "https://api.polygon.io";

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }
  // Restrict to service role / cron only
  const __auth = req.headers.get("Authorization") ?? "";

  const __secret = Deno.env.get("SYNC_SECRET") ?? "";

  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const __secretNext = Deno.env.get("SYNC_SECRET_NEXT") ?? "";
  const __allowed = __secret
    ? await timingSafeMatchAny(__auth, [
        `Bearer ${__secret}`,
        __secretNext ? `Bearer ${__secretNext}` : "",
      ])
    : await timingSafeMatch(__auth, __srk ? `Bearer ${__srk}` : "");

  if (!__allowed) {

    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });

  }
  try {
    const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!POLYGON_API_KEY) throw new Error("POLYGON_API_KEY not set");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const today = new Date();
    const todayStr = fmt(today);

    const upcomingTo = new Date(today);
    upcomingTo.setDate(upcomingTo.getDate() + 14);
    const upcomingToStr = fmt(upcomingTo);

    const recentFrom = new Date(today);
    recentFrom.setDate(recentFrom.getDate() - 7);
    const recentFromStr = fmt(recentFrom);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = fmt(yesterday);

    const mapTime = (t: any): string | null => {
      if (t === "before_market") return "before_open";
      if (t === "after_market") return "after_close";
      return null;
    };

    const fetchAll = async (initialUrl: string): Promise<any[]> => {
      const out: any[] = [];
      let url: string | null = initialUrl;
      let safety = 0;
      while (url && safety < 50) {
        safety++;
        const res = await fetch(url);
        if (!res.ok) {
          await res.text();
          break;
        }
        const json: any = await res.json();
        const results: any[] = json.results ?? [];
        if (results.length === 0) break;
        out.push(...results);
        if (json.next_url) {
          url = `${json.next_url}&apiKey=${POLYGON_API_KEY}`;
        } else {
          url = null;
        }
      }
      return out;
    };

    // PASS 1: upcoming estimates
    const upcomingUrl = `${MASSIVE_BASE}/benzinga/v1/earnings?date.gte=${todayStr}&date.lte=${upcomingToStr}&limit=1000&apiKey=${POLYGON_API_KEY}`;
    const upcomingResults = await fetchAll(upcomingUrl);

    // PASS 2: recent actuals
    const recentUrl = `${MASSIVE_BASE}/benzinga/v1/earnings?date.gte=${recentFromStr}&date.lte=${yesterdayStr}&limit=1000&apiKey=${POLYGON_API_KEY}`;
    const recentResults = await fetchAll(recentUrl);

    const merged = new Map<string, any>();

    const ingest = (item: any) => {
      const symbol = item.ticker ?? item.T;
      const report_date = item.date;
      if (!symbol || !report_date) return;
      const company_name = item.name ?? item.companyName ?? symbol;
      const key = `${symbol}-${report_date}`;
      const row = {
        symbol,
        company_name,
        report_date,
        estimate_eps: item.eps_estimate ?? null,
        actual_eps: item.eps ?? null,
        surprise_percent: item.eps_surprise_percent ?? null,
        time_of_day: mapTime(item.time),
      };
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, row);
      } else {
        merged.set(key, {
          symbol,
          company_name: existing.company_name ?? company_name,
          report_date,
          estimate_eps: row.estimate_eps ?? existing.estimate_eps,
          actual_eps: row.actual_eps ?? existing.actual_eps,
          surprise_percent: row.surprise_percent ?? existing.surprise_percent,
          time_of_day: row.time_of_day ?? existing.time_of_day,
        });
      }
    };

    for (const r of upcomingResults) ingest(r);
    for (const r of recentResults) ingest(r);

    const rows = Array.from(merged.values());

    let upserted = 0;
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await sb
        .from("earnings_calendar")
        .upsert(batch, { onConflict: "symbol,report_date" });
      if (error) throw error;
      upserted += batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        upcoming: upcomingResults.length,
        actuals: recentResults.length,
        upserted,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-earnings error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
