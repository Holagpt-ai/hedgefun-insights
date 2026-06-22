import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const SYNC_SECRET = (await (async () => {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data } = await sb
        .from("vault.decrypted_secrets")
        .select("decrypted_secret")
        .eq("name", "SYNC_SECRET")
        .single();
      return data?.decrypted_secret ?? "";
    })());

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY")!;

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    const to = new Date(today);
    to.setDate(to.getDate() + 7);

    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${fmt(from)}&to=${fmt(to)}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Finnhub earnings error: ${res.status}`);
    const json = await res.json();
    const items: any[] = json.earningsCalendar ?? [];

    const mapTime = (t: string | undefined) => {
      if (!t) return "during";
      if (t === "bmo") return "before_open";
      if (t === "amc") return "after_close";
      return "during";
    };

    const dedupMap = new Map<string, any>();
    for (const i of items) {
      if (!i.symbol || !i.date) continue;
      const key = `${i.symbol}-${i.date}`;
      const row = {
        symbol: i.symbol,
        company_name: i.symbol,
        report_date: i.date,
        estimate_eps: i.epsEstimate ?? null,
        actual_eps: i.epsActual ?? null,
        surprise_percent:
          i.epsEstimate && i.epsActual
            ? Number(
                (((i.epsActual - i.epsEstimate) / Math.abs(i.epsEstimate)) * 100).toFixed(2)
              )
            : null,
        time_of_day: mapTime(i.hour),
      };
      // Keep the row with more complete data (prefer actuals over estimates-only)
      const existing = dedupMap.get(key);
      if (!existing || (row.actual_eps !== null && existing.actual_eps === null)) {
        dedupMap.set(key, row);
      }
    }
    const rows = Array.from(dedupMap.values());

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

    return new Response(JSON.stringify({ ok: true, fetched: items.length, upserted }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-earnings-finnhub error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
