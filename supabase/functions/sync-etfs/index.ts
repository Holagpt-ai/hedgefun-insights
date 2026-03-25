import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MASSIVE_BASE = "https://api.massive.com";

// Top ~100 ETFs by AUM to seed with
const ETF_TICKERS = [
  "VOO","IVV","SPY","VTI","QQQ","BND","VEA","VUG","VTV","AGG",
  "IEMG","VIG","XLK","VXUS","IWM","GLD","VNQ","BNDX","SCHD","EFA",
  "RSP","TLT","VCIT","XLF","QUAL","XLV","XLE","JEPI","LQD","DIA",
  "IAU","SHY","IBIT","XLI","HYG","SOXX","SLV","FBTC","SCHH","ARKK",
  "XLRE","PDBC","IYR","USO","BITO","VGT","VO","IWF","VWO","IJH",
  "IEFA","ITOT","JEPQ","QYLD","QQQM","VT","TQQQ","VOOG",
  "XLC","XLU","XLP","XLY","XLB","VTIP","VCSH","VMBS","BSV","BIV",
  "VBR","VBK","MDY","IWD","IWN","IWO","IWP","DVY","HDV","VYM",
  "DGRO","NOBL","SDY","FVD","DGRW","FTEC","FHLC","FDIS","FREL","FENY",
  "GDX","GDXJ","EEM","EWJ","EWZ","FXI","INDA","KRE","XBI","IBB"
];

function cleanName(raw: string): string {
  return raw
    .replace(/\s*(Common Stock|Ordinary Shares|Class [A-Z]|Units|Warrant|Rights|Depositary Shares).*$/i, "")
    .replace(/,?\s*(Inc\.?|Corp\.?|Ltd\.?|LLC|LP|PLC|Co\.?|N\.V\.?|S\.A\.?)$/i, "")
    .trim();
}

serve(async () => {
  try {
    const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!POLYGON_API_KEY) throw new Error("POLYGON_API_KEY not set");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Fetch snapshots in batches of 50
    const allSnapshots: Record<string, any> = {};
    const batchSize = 50;
    for (let i = 0; i < ETF_TICKERS.length; i += batchSize) {
      const batch = ETF_TICKERS.slice(i, i + batchSize);
      const url = `${MASSIVE_BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(",")}&apiKey=${POLYGON_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        for (const t of json.tickers ?? []) {
          allSnapshots[t.ticker] = t;
        }
      } else {
        await res.text();
      }
      if (i + batchSize < ETF_TICKERS.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // Step 2: Fetch reference data for names
    const refMap: Record<string, any> = {};
    let nextUrl: string | null = `${MASSIVE_BASE}/v3/reference/tickers?type=ETF&market=stocks&active=true&limit=1000&apiKey=${POLYGON_API_KEY}`;
    while (nextUrl) {
      const res = await fetch(nextUrl);
      if (!res.ok) { await res.text(); break; }
      const json = await res.json();
      for (const r of json.results ?? []) {
        refMap[r.ticker] = r;
      }
      nextUrl = json.next_url ? `${json.next_url}&apiKey=${POLYGON_API_KEY}` : null;
      if (nextUrl) await new Promise((r) => setTimeout(r, 1000));
    }

    // Step 3: Build rows
    const rows = ETF_TICKERS.map((sym) => {
      const snap = allSnapshots[sym];
      const ref = refMap[sym];
      return {
        symbol: sym,
        name: ref?.name ? cleanName(ref.name) : (snap?.ticker ? sym : sym),
        asset_class: null, // Not available from API
        total_assets: ref?.market_cap ?? null,
        price: snap?.day?.c ?? snap?.prevDay?.c ?? null,
        change_percent: snap?.todaysChangePerc ?? null,
        volume: snap?.day?.v ?? null,
        holdings: null,
        expense_ratio: null,
        provider: null,
        inception_date: null,
        ytd_return: null,
        updated_at: new Date().toISOString(),
      };
    });

    // Step 4: Upsert
    const { error } = await sb.from("etfs").upsert(rows, { onConflict: "symbol" });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, synced: rows.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-etfs error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
