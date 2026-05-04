import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SP500_TICKERS = [
  'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK','AEE',
  'AEP','AES','AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALK',
  'ALL','ALLE','AMAT','AMCR','AMD','AME','AMGN','AMP','AMT','AMZN',
  'ANET','ANSS','AON','AOS','APA','APD','APH','APTV','ARE','ATO',
  'ATVI','AVB','AVGO','AVY','AWK','AXP','AZO',
  'BA','BAC','BAX','BBWI','BBY','BDX','BEN','BG','BIIB',
  'BIO','BK','BKNG','BKR','BLK','BMY','BR','BSX','BWA','BXP',
  'C','CAG','CAH','CARR','CAT','CB','CBOE','CBRE','CCI','CCL',
  'CDAY','CDNS','CDW','CE','CEG','CF','CFG','CHD','CHRW','CHTR',
  'CI','CINF','CL','CLX','CMA','CMCSA','CME','CMG','CMI','CMS',
  'CNC','CNP','COF','COO','COP','COR','COST','CPB','CPRT','CPT',
  'CRL','CRM','CSCO','CSGP','CSX','CTAS','CTLT','CTRA','CTSH','CTVA',
  'CVS','CVX',
  'D','DAL','DAY','DD','DE','DECK','DFS','DG','DGX','DHI',
  'DHR','DIS','DLTR','DOV','DOW','DPZ','DRI','DTE','DUK','DVA','DVN',
  'DXCM',
  'EA','EBAY','ECL','ED','EFX','EIX','EL','EMN','EMR','ENPH',
  'EOG','EPAM','EQIX','EQR','EQT','ES','ESS','ETN','ETR','ETSY',
  'EVRG','EW','EXC','EXPD','EXPE','EXR',
  'F','FANG','FAST','FBHS','FCX','FDS','FDX','FE','FFIV','FI',
  'FICO','FIS','FISV','FITB','FLT','FMC','FOX','FOXA','FRT','FSLR',
  'FTNT','FTV',
  'GD','GDDY','GE','GEHC','GEN','GILD','GIS','GL','GLW','GM',
  'GNRC','GOOG','GOOGL','GPC','GPN','GRMN','GS','GWW',
  'HAL','HAS','HBAN','HCA','PEAK','HD','HOLX','HON','HPE','HPQ',
  'HRL','HSIC','HST','HSY','HUBB','HUM','HWM','HII',
  'IBM','ICE','IDXX','IEX','IFF','ILMN','INCY','INTC','INTU','INVH',
  'IP','IPG','IQV','IR','IRM','ISRG','IT','ITW','IVZ',
  'J','JBHT','JCI','JKHY','JNJ','JNPR','JPM',
  'K','KDP','KEY','KEYS','KHC','KIM','KLAC','KMB','KMI','KMX','KO','KR',
  'KVUE',
  'L','LDOS','LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNT',
  'LOW','LRCX','LULU','LUV','LVS','LW','LYB','LYV',
  'MA','MAA','MAR','MAS','MCD','MCHP','MCK','MCO','MDLZ','MDT',
  'MET','META','MGM','MHK','MKC','MKTX','MLM','MMC','MMM','MNST',
  'MO','MOH','MOS','MPC','MPWR','MRK','MRNA','MRO','MS','MSCI',
  'MSFT','MSI','MTB','MTCH','MTD','MU',
  'NCLH','NDAQ','NDSN','NEE','NEM','NFLX','NI','NKE','NOC','NOW',
  'NRG','NSC','NTAP','NTRS','NUE','NVDA','NVR','NWL','NWS','NWSA',
  'NXPI',
  'O','ODFL','OGN','OKE','OMC','ON','ORCL','ORLY','OTIS','OXY',
  'PARA','PAYC','PAYX','PCAR','PCG','PEG','PEP','PFE','PFG','PG',
  'PGR','PH','PHM','PKG','PLD','PM','PNC','PNR','PNW','POOL',
  'PPG','PPL','PRU','PSA','PSX','PTC','PVH','PWR','PXD',
  'QCOM','QRVO',
  'RCL','REG','REGN','RF','RHI','RJF','RL','RMD','ROK','ROL',
  'ROP','ROST','RSG','RTX',
  'SBAC','SBUX','SCHW','SEE','SHW','SJM','SLB','SNA',
  'SNPS','SO','SPG','SPGI','SRE','STE','STLD','STT','STX','STZ',
  'SWK','SWKS','SYF','SYK','SYY',
  'T','TAP','TDG','TDY','TECH','TEL','TER','TFC','TFX','TGT',
  'TJX','TMO','TMUS','TPR','TRGP','TRMB','TROW','TRV','TSCO','TSLA',
  'TSN','TT','TTWO','TXN','TXT','TYL',
  'UDR','UHS','ULTA','UNH','UNP','UPS','URI','USB',
  'V','VFC','VICI','VLO','VLTO','VMC','VRSK','VRSN','VRTX','VTR','VTRS','VZ',
  'WAB','WAT','WBA','WBD','WDC','WEC','WELL','WFC','WHR','WM',
  'WMB','WMT','WRB','WRK','WST','WTW','WY','WYNN',
  'XEL','XOM','XRAY','XYL',
  'YUM',
  'ZBH','ZBRA','ZION','ZTS',
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }
  // Restrict to service role / cron only
  const __auth = req.headers.get("Authorization") ?? "";
  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!__srk || __auth !== `Bearer ${__srk}`) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!API_KEY) throw new Error("POLYGON_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let updatedSnapshot = 0;
    let updatedDetails = 0;
    let errors = 0;

    // --- Step 1: Fetch snapshots in chunks (URL length limit ~50 tickers) ---
    const CHUNK_SIZE = 50;
    for (let i = 0; i < SP500_TICKERS.length; i += CHUNK_SIZE) {
      const chunk = SP500_TICKERS.slice(i, i + CHUNK_SIZE);
      const tickersParam = chunk.join(",");
      try {
        const res = await fetch(
          `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${API_KEY}`
        );
        if (!res.ok) {
          console.error(`Snapshot chunk ${i} failed: ${res.status}`);
          errors++;
          continue;
        }
        const json = await res.json();
        const tickers = json.tickers ?? [];

        for (const t of tickers) {
          const symbol = t.ticker;
          if (!symbol) continue;
          const row = {
            symbol,
            name: symbol,
            price: t.day?.c ?? t.lastTrade?.p ?? null,
            change_amount: t.todaysChange ?? null,
            change_percent: t.todaysChangePerc ?? null,
            volume: t.day?.v ?? null,
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase
            .from("stocks")
            .upsert(row, { onConflict: "symbol" });
          if (error) {
            console.error(`Upsert snapshot ${symbol}:`, error.message);
            errors++;
          } else {
            updatedSnapshot++;
          }
        }
      } catch (e) {
        console.error(`Snapshot chunk error:`, (e as Error).message);
        errors++;
      }
      if (i + CHUNK_SIZE < SP500_TICKERS.length) await delay(250);
    }

    // --- Step 2: Fetch reference details for stocks missing market_cap, sector, or industry ---
    const { data: missingStocks } = await supabase
      .from("stocks")
      .select("symbol, market_cap, sector, industry")
      .in("symbol", SP500_TICKERS)
      .or("market_cap.is.null,sector.is.null,industry.is.null");

    const tickersToFetch = (missingStocks ?? []).map((s) => s.symbol);
    console.log(`Fetching details for ${tickersToFetch.length} stocks missing market_cap/sector/industry`);

    const SIC_TO_SECTOR: Record<string, string> = {
      "Technology": "Technology",
      "Consumer Cyclical": "Consumer Discretionary",
      "Consumer Defensive": "Consumer Staples",
      "Financial Services": "Financials",
      "Healthcare": "Healthcare",
      "Industrials": "Industrials",
      "Communication Services": "Communication Services",
      "Energy": "Energy",
      "Utilities": "Utilities",
      "Real Estate": "Real Estate",
      "Basic Materials": "Materials",
    };

    const DETAIL_BATCH = 5;
    for (let i = 0; i < tickersToFetch.length; i += DETAIL_BATCH) {
      const batch = tickersToFetch.slice(i, i + DETAIL_BATCH);
      const fetches = batch.map(async (ticker) => {
        try {
          const res = await fetch(
            `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${API_KEY}`
          );
          if (!res.ok) {
            console.error(`Detail ${ticker}: ${res.status}`);
            errors++;
            return;
          }
          const json = await res.json();
          const r = json.results;
          if (!r) return;

          const updateData: Record<string, unknown> = {};
          if (r.name) updateData.name = r.name;
          if (r.market_cap) updateData.market_cap = Math.round(r.market_cap);
          if (r.sic_description) updateData.industry = r.sic_description;
          // Map sector from Massive's type or sic_description
          const rawSector = r.sector || "";
          if (rawSector) {
            updateData.sector = SIC_TO_SECTOR[rawSector] || rawSector;
          }

          if (Object.keys(updateData).length > 0) {
            const { error } = await supabase
              .from("stocks")
              .update(updateData)
              .eq("symbol", ticker);
            if (error) {
              console.error(`Update details ${ticker}:`, error.message);
              errors++;
            } else {
              updatedDetails++;
            }
          }
        } catch (e) {
          console.error(`Detail ${ticker} error:`, (e as Error).message);
          errors++;
        }
      });
      await Promise.all(fetches);
      if (i + DETAIL_BATCH < tickersToFetch.length) await delay(13000);
    }

    return new Response(
      JSON.stringify({
        success: true,
        updatedSnapshot,
        updatedDetails,
        errors,
        totalTickers: SP500_TICKERS.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-screener-stocks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
