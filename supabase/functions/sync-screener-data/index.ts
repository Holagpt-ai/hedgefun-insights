import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://api.polygon.io";

serve(async (req) => {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );


    const { data: secretRows, error: vaultErr } = await sb
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "POLYGON_API_KEY")
      .limit(1);
    const API_KEY = secretRows?.[0]?.decrypted_secret ?? "";
    if (!API_KEY) throw new Error("POLYGON_API_KEY not in Vault");

    const headers = { "Authorization": `Bearer ${API_KEY}` };

    // ── 1. Full Market Snapshot ────────────────────────────────────────────
    const snapRes = await fetch(
      `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false`,
      { headers }
    );
    if (!snapRes.ok) throw new Error(`Snapshot error: ${snapRes.status}`);
    const snapJson = await snapRes.json();
    const allTickers: any[] = snapJson.tickers ?? [];

    // ── 2. Top Gainers & Losers ────────────────────────────────────────────
    const [gainRes, lossRes] = await Promise.all([
      fetch(`${BASE}/v2/snapshot/locale/us/markets/stocks/gainers?include_otc=false`, { headers }),
      fetch(`${BASE}/v2/snapshot/locale/us/markets/stocks/losers?include_otc=false`, { headers }),
    ]);
    const gainers: any[] = gainRes.ok ? ((await gainRes.json()).tickers ?? []) : [];
    const losers: any[] = lossRes.ok ? ((await lossRes.json()).tickers ?? []) : [];

    // ── Helper: safe numeric ───────────────────────────────────────────────
    const n = (v: any): number | null =>
      v !== undefined && v !== null && !isNaN(Number(v)) ? Number(v) : null;

    // ── Helper: RVOL = today volume / prev day volume ──────────────────────
    const rvol = (t: any): number | null => {
      const dayVol = t?.day?.v;
      const prevVol = t?.prevDay?.v;
      if (!dayVol || !prevVol || prevVol === 0) return null;
      return Math.round((dayVol / prevVol) * 10) / 10;
    };

    // ── Helper: gap % = (today open - prev close) / prev close * 100 ──────
    const gap = (t: any): number | null => {
      const open = t?.day?.o;
      const prevClose = t?.prevDay?.c;
      if (!open || !prevClose || prevClose === 0) return null;
      return Math.round(((open - prevClose) / prevClose) * 1000) / 10;
    };

    // ── Tab builders ───────────────────────────────────────────────────────

    // Day Trade Radar: price $2-$20, change > 10%, RVOL >= 5x
    const dayTradeRows = allTickers
      .filter((t) => {
        const price = t?.day?.c ?? t?.lastTrade?.p;
        const chg = t?.todaysChangePerc;
        const rv = rvol(t);
        return (
          price >= 2 && price <= 20 &&
          chg >= 10 &&
          rv !== null && rv >= 5
        );
      })
      .sort((a, b) => (rvol(b) ?? 0) - (rvol(a) ?? 0))
      .slice(0, 20)
      .map((t) => ({
        tab_id: "day_trade_radar",
        symbol: t.ticker,
        company_name: t.ticker,
        price: n(t?.day?.c ?? t?.lastTrade?.p),
        change_percent: n(t?.todaysChangePerc),
        volume: n(t?.day?.v),
        avg_volume: n(t?.prevDay?.v),
        rvol: rvol(t),
        float_shares: null,
        gap_percent: null,
        high_52w: null,
        low_52w: null,
        market_cap: null,
        updated_at: new Date().toISOString(),
      }));

    // Gappers: gap > 5%
    const gapperRows = allTickers
      .filter((t) => {
        const g = gap(t);
        return g !== null && Math.abs(g) >= 5;
      })
      .sort((a, b) => Math.abs(gap(b) ?? 0) - Math.abs(gap(a) ?? 0))
      .slice(0, 20)
      .map((t) => ({
        tab_id: "gappers",
        symbol: t.ticker,
        company_name: t.ticker,
        price: n(t?.day?.c ?? t?.lastTrade?.p),
        change_percent: n(t?.todaysChangePerc),
        volume: n(t?.day?.v),
        avg_volume: null,
        rvol: null,
        float_shares: null,
        gap_percent: gap(t),
        high_52w: null,
        low_52w: null,
        market_cap: null,
        updated_at: new Date().toISOString(),
      }));

    // Volume Spikes: RVOL >= 3x
    const volumeSpikeRows = allTickers
      .filter((t) => {
        const rv = rvol(t);
        return rv !== null && rv >= 3;
      })
      .sort((a, b) => (rvol(b) ?? 0) - (rvol(a) ?? 0))
      .slice(0, 20)
      .map((t) => ({
        tab_id: "volume_spikes",
        symbol: t.ticker,
        company_name: t.ticker,
        price: null,
        change_percent: n(t?.todaysChangePerc),
        volume: n(t?.day?.v),
        avg_volume: n(t?.prevDay?.v),
        rvol: rvol(t),
        float_shares: null,
        gap_percent: null,
        high_52w: null,
        low_52w: null,
        market_cap: null,
        updated_at: new Date().toISOString(),
      }));

    // Gainers / Losers: top 20 gainers + top 20 losers combined
    const gainersLosersRows = [...gainers, ...losers].map((t) => ({
      tab_id: "gainers_losers",
      symbol: t.ticker,
      company_name: t.ticker,
      price: n(t?.day?.c ?? t?.lastTrade?.p),
      change_percent: n(t?.todaysChangePerc),
      volume: n(t?.day?.v),
      avg_volume: null,
      rvol: null,
      float_shares: null,
      gap_percent: null,
      high_52w: null,
      low_52w: null,
      market_cap: null,
      updated_at: new Date().toISOString(),
    }));

    // Unusual Volume: RVOL >= 4x
    const unusualVolumeRows = allTickers
      .filter((t) => {
        const rv = rvol(t);
        return rv !== null && rv >= 4;
      })
      .sort((a, b) => (rvol(b) ?? 0) - (rvol(a) ?? 0))
      .slice(0, 20)
      .map((t) => ({
        tab_id: "unusual_volume",
        symbol: t.ticker,
        company_name: t.ticker,
        price: null,
        change_percent: null,
        volume: n(t?.day?.v),
        avg_volume: n(t?.prevDay?.v),
        rvol: rvol(t),
        float_shares: null,
        gap_percent: null,
        high_52w: null,
        low_52w: null,
        market_cap: null,
        updated_at: new Date().toISOString(),
      }));

    // New Highs/Lows: within 2% of 52W high or low
    // Note: 52W data not in snapshot — placeholder empty for now, populated separately
    const newHighsLowsRows: any[] = [];

    // ── 3. Upsert all tabs ─────────────────────────────────────────────────
    const allRows = [
      ...dayTradeRows,
      ...gapperRows,
      ...volumeSpikeRows,
      ...gainersLosersRows,
      ...unusualVolumeRows,
      ...newHighsLowsRows,
    ];

    let upserted = 0;
    const batchSize = 100;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize);
      const { error } = await sb
        .from("screener_results")
        .upsert(batch, { onConflict: "tab_id,symbol" });
      if (error) throw error;
      upserted += batch.length;
    }

    // ── 4. Delete stale rows older than 30 minutes ─────────────────────────
    await sb
      .from("screener_results")
      .delete()
      .lt("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

    return new Response(
      JSON.stringify({
        ok: true,
        tickers_scanned: allTickers.length,
        upserted,
        tabs: {
          day_trade_radar: dayTradeRows.length,
          gappers: gapperRows.length,
          volume_spikes: volumeSpikeRows.length,
          gainers_losers: gainersLosersRows.length,
          unusual_volume: unusualVolumeRows.length,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-screener-data error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
