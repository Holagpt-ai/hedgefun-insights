import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MASSIVE_BASE = "https://api.polygon.io";

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
    .replace(/\s*(Common Stock|Ordinary Shares|Class [A-Z]|Units|Warrant|Rights|Depositary Shares).*$/i, "")
    .replace(/,?\s*(Inc\.?|Corp\.?|Ltd\.?|LLC|LP|PLC|Co\.?|N\.V\.?|S\.A\.?)$/i, "")
    .trim();
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url);
    if (res.ok || i === retries) return res;
    await res.text(); // consume body
    await new Promise((r) => setTimeout(r, 2000));
  }
  return fetch(url); // unreachable but satisfies TS
}

serve(async (req) => {

  // Restrict to service role / cron only
  const __auth = req.headers.get("Authorization") ?? "";
  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!__srk || __auth !== `Bearer ${__srk}`) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
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

    // Step 3: Fetch detailed ticker info for total_assets (market_cap) per ETF
    // Process in small batches to respect rate limits
    const detailMap: Record<string, any> = {};
    const detailBatchSize = 5;
    for (let i = 0; i < ETF_TICKERS.length; i += detailBatchSize) {
      const batch = ETF_TICKERS.slice(i, i + detailBatchSize);
      const results = await Promise.all(
        batch.map(async (sym) => {
          try {
            const url = `${MASSIVE_BASE}/v3/reference/tickers/${sym}?apiKey=${POLYGON_API_KEY}`;
            const res = await fetchWithRetry(url);
            if (res.ok) {
              const json = await res.json();
              return { sym, data: json.results };
            }
            await res.text();
          } catch { /* skip */ }
          return { sym, data: null };
        })
      );
      for (const { sym, data } of results) {
        if (data) detailMap[sym] = data;
      }
      if (i + detailBatchSize < ETF_TICKERS.length) {
        await new Promise((r) => setTimeout(r, 13000)); // respect free-tier rate limits
      }
    }

    // Step 4: Try to fetch holdings count from ETF Global constituents endpoint
    const holdingsCountMap: Record<string, number> = {};
    for (let i = 0; i < ETF_TICKERS.length; i += detailBatchSize) {
      const batch = ETF_TICKERS.slice(i, i + detailBatchSize);
      const results = await Promise.all(
        batch.map(async (sym) => {
          try {
            const url = `${MASSIVE_BASE}/vX/reference/tickers/${sym}/constituents?limit=1&apiKey=${POLYGON_API_KEY}`;
            const res = await fetch(url);
            if (res.ok) {
              const json = await res.json();
              // The count field tells us total holdings
              if (json.count) return { sym, count: json.count };
            } else {
              await res.text();
            }
          } catch { /* skip */ }
          return { sym, count: null };
        })
      );
      for (const { sym, count } of results) {
        if (count) holdingsCountMap[sym] = count;
      }
      if (i + detailBatchSize < ETF_TICKERS.length) {
        await new Promise((r) => setTimeout(r, 13000));
      }
    }

    // Step 5: Build rows with enriched data
    const rows = ETF_TICKERS.map((sym) => {
      const snap = allSnapshots[sym];
      const ref = refMap[sym];
      const detail = detailMap[sym];

      // For ETFs, market_cap from detail endpoint represents AUM/total_assets
      const totalAssets = detail?.market_cap ?? ref?.market_cap ?? null;
      const holdingsCount = holdingsCountMap[sym] ?? null;
      const expenseRatio = EXPENSE_RATIOS[sym] ?? null;

      return {
        symbol: sym,
        name: ref?.name ? cleanName(ref.name) : (snap?.ticker ? sym : sym),
        asset_class: detail?.sic_description ?? null,
        total_assets: totalAssets,
        price: snap?.day?.c ?? snap?.prevDay?.c ?? null,
        change_percent: snap?.todaysChangePerc ?? null,
        volume: snap?.day?.v ?? null,
        holdings: holdingsCount,
        expense_ratio: expenseRatio,
        provider: null,
        inception_date: detail?.list_date ?? null,
        ytd_return: null,
        updated_at: new Date().toISOString(),
      };
    });

    // Step 6: Upsert
    const { error } = await sb.from("etfs").upsert(rows, { onConflict: "symbol" });
    if (error) throw error;

    const enriched = rows.filter((r) => r.total_assets || r.holdings || r.expense_ratio).length;
    return new Response(JSON.stringify({ ok: true, synced: rows.length, enriched }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-etfs error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
