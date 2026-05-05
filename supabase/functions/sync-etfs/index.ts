import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.polygon.io";

// Well-known expense ratios for major ETFs (these change very rarely)
const EXPENSE_RATIOS: Record<string, number> = {
  VOO:0.03,IVV:0.03,SPY:0.0945,VTI:0.03,QQQ:0.20,BND:0.03,VEA:0.05,VUG:0.04,VTV:0.04,AGG:0.03,
  IEMG:0.09,VIG:0.06,XLK:0.09,VXUS:0.07,IWM:0.19,GLD:0.40,VNQ:0.12,BNDX:0.07,SCHD:0.06,EFA:0.32,
  RSP:0.20,TLT:0.15,VCIT:0.04,XLF:0.09,QUAL:0.15,XLV:0.09,XLE:0.09,JEPI:0.35,LQD:0.14,DIA:0.16,
  IAU:0.25,SHY:0.15,IBIT:0.25,XLI:0.09,HYG:0.49,SOXX:0.35,SLV:0.50,FBTC:0.25,SCHH:0.07,ARKK:0.75,
  XLRE:0.09,PDBC:0.59,IYR:0.39,USO:0.60,BITO:0.95,VGT:0.10,VO:0.04,IWF:0.19,VWO:0.08,IJH:0.05,
  IEFA:0.07,ITOT:0.03,JEPQ:0.35,QYLD:0.60,QQQM:0.15,VT:0.07,TQQQ:0.86,VOOG:0.10,
  XLC:0.09,XLU:0.09,XLP:0.09,XLY:0.09,XLB:0.09,VTIP:0.04,VCSH:0.04,VMBS:0.04,BSV:0.04,BIV:0.04,
  VBR:0.07,VBK:0.07,MDY:0.23,IWD:0.19,IWN:0.24,IWO:0.24,IWP:0.24,DVY:0.38,HDV:0.08,VYM:0.06,
  DGRO:0.08,NOBL:0.35,SDY:0.35,FVD:0.64,DGRW:0.28,FTEC:0.08,FHLC:0.08,FDIS:0.08,FREL:0.08,FENY:0.08,
  GDX:0.51,GDXJ:0.52,EEM:0.68,EWJ:0.50,EWZ:0.58,FXI:0.74,INDA:0.64,KRE:0.35,XBI:0.35,IBB:0.44,
};

function cleanName(raw: string): string {
  return raw
    .replace(/\s*-\s*(ETF|Exchange Traded Fund|Fund).*$/i, "")
    .replace(/\s+ETF$/i, "")
    .trim();
}

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`Fetch ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("fetch error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const __auth = req.headers.get("Authorization") ?? "";
  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!__srk || __auth !== `Bearer ${__srk}`) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!POLYGON_API_KEY) throw new Error("POLYGON_API_KEY not set");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { searchParams } = new URL(req.url);
    const maxPages = parseInt(searchParams.get("maxPages") ?? "10", 10);

    // Step 1: Paginate all active ETFs from reference/tickers
    const refMap: Record<string, any> = {};
    let nextUrl: string | null = `${POLYGON_BASE}/v3/reference/tickers?type=ETF&market=stocks&active=true&limit=1000&apiKey=${POLYGON_API_KEY}`;
    let pages = 0;
    while (nextUrl && pages < maxPages) {
      pages++;
      const json = await fetchJson(nextUrl);
      if (!json) break;
      for (const r of json.results ?? []) {
        if (r.ticker) refMap[r.ticker] = r;
      }
      nextUrl = json.next_url ? `${json.next_url}&apiKey=${POLYGON_API_KEY}` : null;
      if (nextUrl) await new Promise((r) => setTimeout(r, 300));
    }

    const allTickers = Object.keys(refMap);
    console.log(`Fetched ${allTickers.length} ETFs across ${pages} pages`);

    // Step 2: Snapshot pricing for all tickers in batches of 250
    const snapMap: Record<string, any> = {};
    const batchSize = 250;
    for (let i = 0; i < allTickers.length; i += batchSize) {
      const batch = allTickers.slice(i, i + batchSize);
      const url = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(",")}&apiKey=${POLYGON_API_KEY}`;
      const json = await fetchJson(url);
      if (json) {
        for (const t of json.tickers ?? []) {
          if (t.ticker) snapMap[t.ticker] = t;
        }
      }
      if (i + batchSize < allTickers.length) await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`Snapshots fetched for ${Object.keys(snapMap).length} ETFs`);

    // Step 3: Build rows
    const rows = allTickers.map((sym) => {
      const ref = refMap[sym];
      const snap = snapMap[sym];
      return {
        symbol: sym,
        name: ref?.name ? cleanName(ref.name) : sym,
        asset_class: ref?.sic_description ?? null,
        total_assets: ref?.market_cap ? Math.round(ref.market_cap) : null,
        price: snap?.day?.c ?? snap?.prevDay?.c ?? snap?.lastTrade?.p ?? null,
        change_percent: snap?.todaysChangePerc ?? null,
        volume: snap?.day?.v ?? null,
        holdings: null,
        expense_ratio: EXPENSE_RATIOS[sym] ?? null,
        provider: null,
        inception_date: ref?.list_date ?? null,
        ytd_return: null,
        updated_at: new Date().toISOString(),
      };
    });

    // Step 4: Bulk upsert in chunks
    let upserted = 0;
    let errors = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from("etfs").upsert(chunk, { onConflict: "symbol" });
      if (error) {
        console.error("Upsert error:", error.message);
        errors++;
      } else {
        upserted += chunk.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, total: allTickers.length, upserted, withSnapshot: Object.keys(snapMap).length, pages, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-etfs error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
