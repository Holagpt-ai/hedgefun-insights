import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
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
    from.setDate(from.getDate() - 30);
    const to = new Date(today);
    to.setDate(to.getDate() + 60);
    const url = `https://finnhub.io/api/v1/calendar/ipo?from=${fmt(from)}&to=${fmt(to)}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Finnhub IPO error: ${res.status}`);
    const json = await res.json();
    const items: any[] = json.ipoCalendar ?? [];

    const mapStatus = (s: string | undefined): "recent" | "upcoming" | "spac" => {
      if (!s) return "upcoming";
      const lower = s.toLowerCase();
      if (lower.includes("priced") || lower.includes("filed")) return "recent";
      if (lower.includes("spac") || lower.includes("blank check")) return "spac";
      return "upcoming";
    };

    const rows = items
      .filter((i) => i.name && i.date)
      .map((i) => ({
        symbol: i.symbol ?? null,
        name: i.name,
        ipo_date: i.date,
        price_range: i.price ? `$${i.price}` : null,
        offer_price: i.price ? parseFloat(i.price) : null,
        status: mapStatus(i.status),
        exchange: i.exchange ?? null,
      }));

    // Dedup: Finnhub can return multiple rows for the same symbol+ipo_date
    // (e.g. a listing revised from "upcoming" to "recent"). Postgres upsert
    // fails if the same conflict key appears twice in one batch. Collapse to
    // one row per key, preferring "recent" > "spac" > "upcoming", then a
    // non-null offer_price as tiebreaker.
    const statusScore = (s: string) => (s === "recent" ? 2 : s === "spac" ? 1 : 0);
    const dedupMap = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = `${row.symbol ?? "null"}-${row.ipo_date}`;
      const existing = dedupMap.get(key);
      if (!existing) {
        dedupMap.set(key, row);
        continue;
      }
      const existingScore = statusScore(existing.status);
      const newScore = statusScore(row.status);
      if (
        newScore > existingScore ||
        (newScore === existingScore && row.offer_price !== null && existing.offer_price === null)
      ) {
        dedupMap.set(key, row);
      }
    }
    const dedupedRows = Array.from(dedupMap.values());

    let upserted = 0;
    const errors: string[] = [];
    const batchSize = 50;
    for (let i = 0; i < dedupedRows.length; i += batchSize) {
      const batch = dedupedRows.slice(i, i + batchSize);
      const { error } = await sb
        .from("ipo_list")
        .upsert(batch, { onConflict: "symbol,ipo_date" });
      if (error) {
        console.error("ipo upsert error:", error.message, JSON.stringify(batch.slice(0, 3)));
        errors.push(error.message);
        continue;
      }
      upserted += batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        fetched: items.length,
        deduped: dedupedRows.length,
        upserted,
        errors,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-ipo-calendar error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
