import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map SIC codes (first 2 digits) to GICS-style sectors
function sicToSector(sicCode: string): string {
  const sic2 = parseInt(sicCode.substring(0, 2));
  if (sic2 >= 10 && sic2 <= 14) return "Energy";
  if (sic2 >= 15 && sic2 <= 17) return "Industrials"; // Construction
  if (sic2 >= 20 && sic2 <= 21) return "Consumer Staples"; // Food, Tobacco
  if (sic2 >= 22 && sic2 <= 23) return "Consumer Discretionary"; // Textiles, Apparel
  if (sic2 >= 24 && sic2 <= 27) return "Materials"; // Lumber, Paper, Printing
  if (sic2 >= 28 && sic2 <= 29) return "Healthcare"; // Chemicals, Pharma, Petroleum refining
  if (sic2 === 29) return "Energy"; // Petroleum refining
  if (sic2 >= 30 && sic2 <= 34) return "Materials"; // Rubber, Glass, Metals
  if (sic2 >= 35 && sic2 <= 36) return "Technology"; // Machinery, Electronics
  if (sic2 === 37) return "Industrials"; // Transportation equipment
  if (sic2 === 38) return "Healthcare"; // Instruments
  if (sic2 === 39) return "Consumer Discretionary"; // Misc manufacturing
  if (sic2 >= 40 && sic2 <= 47) return "Industrials"; // Transportation
  if (sic2 === 48) return "Communication Services"; // Telecom
  if (sic2 === 49) return "Utilities"; // Electric, Gas, Water
  if (sic2 >= 50 && sic2 <= 51) return "Consumer Discretionary"; // Wholesale
  if (sic2 >= 52 && sic2 <= 59) return "Consumer Discretionary"; // Retail
  if (sic2 >= 60 && sic2 <= 67) return "Financials"; // Finance, Insurance, Real Estate
  if (sic2 === 65) return "Real Estate";
  if (sic2 >= 70 && sic2 <= 79) return "Consumer Discretionary"; // Services
  if (sic2 >= 73 && sic2 <= 73) return "Technology"; // Computer services
  if (sic2 >= 80 && sic2 <= 82) return "Healthcare"; // Health services
  if (sic2 >= 87 && sic2 <= 87) return "Technology"; // Engineering services
  return "Industrials";
}

// Well-known overrides for S&P 500 stocks where SIC is misleading
const SECTOR_OVERRIDES: Record<string, string> = {
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Communication Services", GOOG: "Communication Services",
  META: "Communication Services", AMZN: "Consumer Discretionary", TSLA: "Consumer Discretionary",
  NVDA: "Technology", AVGO: "Technology", AMD: "Technology", INTC: "Technology",
  CRM: "Technology", ADBE: "Technology", ORCL: "Technology", CSCO: "Technology",
  TXN: "Technology", QCOM: "Technology", AMAT: "Technology", MU: "Technology",
  KLAC: "Technology", SNPS: "Technology", CDNS: "Technology", MCHP: "Technology",
  NXPI: "Technology", ON: "Technology", FTNT: "Technology", PANW: "Technology",
  NOW: "Technology", INTU: "Technology", ADSK: "Technology", ANSS: "Technology",
  PLTR: "Technology", IT: "Technology", MPWR: "Technology",
  JPM: "Financials", BAC: "Financials", WFC: "Financials", GS: "Financials",
  MS: "Financials", BLK: "Financials", SCHW: "Financials", C: "Financials",
  USB: "Financials", PNC: "Financials", AXP: "Financials", COF: "Financials",
  V: "Financials", MA: "Financials", SPGI: "Financials", MCO: "Financials",
  CME: "Financials", ICE: "Financials", CB: "Financials",
  JNJ: "Healthcare", UNH: "Healthcare", LLY: "Healthcare", ABBV: "Healthcare",
  MRK: "Healthcare", PFE: "Healthcare", TMO: "Healthcare", ABT: "Healthcare",
  DHR: "Healthcare", BMY: "Healthcare", AMGN: "Healthcare", GILD: "Healthcare",
  ISRG: "Healthcare", VRTX: "Healthcare", REGN: "Healthcare", SYK: "Healthcare",
  MDT: "Healthcare", BSX: "Healthcare", EW: "Healthcare", DXCM: "Healthcare",
  BDX: "Healthcare", CI: "Healthcare", HUM: "Healthcare", CNC: "Healthcare",
  ELV: "Healthcare", CVS: "Healthcare", MRNA: "Healthcare", BIIB: "Healthcare",
  XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy", EOG: "Energy",
  MPC: "Energy", PSX: "Energy", VLO: "Energy", OXY: "Energy", HAL: "Energy",
  DVN: "Energy", BKR: "Energy", FANG: "Energy", CTRA: "Energy",
  NFLX: "Communication Services", DIS: "Communication Services", CMCSA: "Communication Services",
  T: "Communication Services", VZ: "Communication Services", TMUS: "Communication Services",
  CHTR: "Communication Services", WBD: "Communication Services", EA: "Communication Services",
  TTWO: "Communication Services", MTCH: "Communication Services", OMC: "Communication Services",
  IPG: "Communication Services", LYV: "Communication Services",
  NEE: "Utilities", DUK: "Utilities", SO: "Utilities", D: "Utilities",
  AEP: "Utilities", SRE: "Utilities", EXC: "Utilities", XEL: "Utilities",
  ED: "Utilities", PEG: "Utilities", WEC: "Utilities", ES: "Utilities",
  AEE: "Utilities", CMS: "Utilities", DTE: "Utilities", ETR: "Utilities",
  FE: "Utilities", PPL: "Utilities", CNP: "Utilities", NI: "Utilities",
  PNW: "Utilities", EVRG: "Utilities", AES: "Utilities", NRG: "Utilities",
  CEG: "Utilities", AWK: "Utilities", LNT: "Utilities",
  PLD: "Real Estate", AMT: "Real Estate", CCI: "Real Estate", EQIX: "Real Estate",
  PSA: "Real Estate", SPG: "Real Estate", O: "Real Estate", WELL: "Real Estate",
  DLR: "Real Estate", EQR: "Real Estate", AVB: "Real Estate", VICI: "Real Estate",
  IRM: "Real Estate", MAA: "Real Estate", ESS: "Real Estate", UDR: "Real Estate",
  KIM: "Real Estate", REG: "Real Estate", FRT: "Real Estate", CPT: "Real Estate",
  BXP: "Real Estate", INVH: "Real Estate", ARE: "Real Estate", SBAC: "Real Estate",
  HST: "Real Estate", VTR: "Real Estate",
  PG: "Consumer Staples", KO: "Consumer Staples", PEP: "Consumer Staples",
  WMT: "Consumer Staples", COST: "Consumer Staples", PM: "Consumer Staples",
  MO: "Consumer Staples", MDLZ: "Consumer Staples", CL: "Consumer Staples",
  KMB: "Consumer Staples", GIS: "Consumer Staples", HSY: "Consumer Staples",
  KHC: "Consumer Staples", SJM: "Consumer Staples", CAG: "Consumer Staples",
  K: "Consumer Staples", CPB: "Consumer Staples", HRL: "Consumer Staples",
  MKC: "Consumer Staples", CHD: "Consumer Staples", CLX: "Consumer Staples",
  KDP: "Consumer Staples", MNST: "Consumer Staples", STZ: "Consumer Staples",
  TAP: "Consumer Staples", BG: "Consumer Staples", ADM: "Consumer Staples",
  KR: "Consumer Staples", SYY: "Consumer Staples", TSN: "Consumer Staples",
  EL: "Consumer Staples", KVUE: "Consumer Staples",
  HD: "Consumer Discretionary", LOW: "Consumer Discretionary",
  NKE: "Consumer Discretionary", MCD: "Consumer Discretionary",
  SBUX: "Consumer Discretionary", TJX: "Consumer Discretionary",
  BKNG: "Consumer Discretionary", MAR: "Consumer Discretionary",
  GM: "Consumer Discretionary", F: "Consumer Discretionary",
  ROST: "Consumer Discretionary", DHI: "Consumer Discretionary",
  LEN: "Consumer Discretionary", PHM: "Consumer Discretionary",
  CCL: "Consumer Discretionary", RCL: "Consumer Discretionary",
  YUM: "Consumer Discretionary", DPZ: "Consumer Discretionary",
  CMG: "Consumer Discretionary", DRI: "Consumer Discretionary",
  APTV: "Consumer Discretionary", GRMN: "Consumer Discretionary",
  RL: "Consumer Discretionary", TPR: "Consumer Discretionary",
  HAS: "Consumer Discretionary", BWA: "Consumer Discretionary",
  LULU: "Consumer Discretionary", ULTA: "Consumer Discretionary",
  BBY: "Consumer Discretionary", ETSY: "Consumer Discretionary",
  EBAY: "Consumer Discretionary", EXPE: "Consumer Discretionary",
  NCLH: "Consumer Discretionary", MGM: "Consumer Discretionary",
  LVS: "Consumer Discretionary", WYNN: "Consumer Discretionary",
  POOL: "Consumer Discretionary", NVR: "Consumer Discretionary",
  DECK: "Consumer Discretionary", GPC: "Consumer Discretionary",
  LKQ: "Consumer Discretionary", KMX: "Consumer Discretionary",
  DG: "Consumer Discretionary", DLTR: "Consumer Discretionary",
  GE: "Industrials", CAT: "Industrials", HON: "Industrials",
  RTX: "Industrials", LMT: "Industrials", UNP: "Industrials",
  UPS: "Industrials", BA: "Industrials", DE: "Industrials",
  GD: "Industrials", MMM: "Industrials", EMR: "Industrials",
  ITW: "Industrials", ETN: "Industrials", ROK: "Industrials",
  CMI: "Industrials", PH: "Industrials", IR: "Industrials",
  DOV: "Industrials", AME: "Industrials", IEX: "Industrials",
  SWK: "Industrials", GWW: "Industrials", FAST: "Industrials",
  WM: "Industrials", RSG: "Industrials", WAB: "Industrials",
  NSC: "Industrials", CSX: "Industrials", JBHT: "Industrials",
  CHRW: "Industrials", EXPD: "Industrials", DAL: "Industrials",
  LUV: "Industrials", ALK: "Industrials", ODFL: "Industrials",
  FDX: "Industrials", CARR: "Industrials", OTIS: "Industrials",
  GEHC: "Healthcare", VRSK: "Industrials", TRMB: "Industrials",
  TDG: "Industrials", HWM: "Industrials", TDY: "Industrials",
  TXT: "Industrials", LHX: "Industrials", HII: "Industrials",
  NOC: "Industrials", LDOS: "Industrials", J: "Industrials",
  PWR: "Industrials", AJG: "Financials", MMC: "Financials",
  AON: "Financials", CINF: "Financials", ALL: "Financials",
  PGR: "Financials", TRV: "Financials", AFL: "Financials",
  MET: "Financials", PRU: "Financials",
  LIN: "Materials", APD: "Materials", SHW: "Materials",
  ECL: "Materials", NUE: "Materials", STLD: "Materials",
  FCX: "Materials", NEM: "Materials", VMC: "Materials",
  MLM: "Materials", CE: "Materials", EMN: "Materials",
  ALB: "Materials", FMC: "Materials", MOS: "Materials",
  CF: "Materials", IP: "Materials", PKG: "Materials",
  AVY: "Materials", SEE: "Materials", IFF: "Materials",
  AMCR: "Materials", WRK: "Materials", BEN: "Financials",
  NDAQ: "Financials", CBOE: "Financials", MKTX: "Financials",
  MSCI: "Financials", FI: "Financials", GPN: "Financials",
  FIS: "Financials", FISV: "Financials", BR: "Financials",
  FICO: "Technology", KEYS: "Technology",
};

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

  const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  const { data: missing } = await supabase
    .from("stocks")
    .select("symbol")
    .or("sector.is.null,industry.is.null")
    .order("symbol")
    .limit(limit);

  const tickers = (missing ?? []).map((r) => r.symbol);
  let updated = 0;
  let errors = 0;

  const BATCH = 5;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const fetches = batch.map(async (ticker) => {
      try {
        const res = await fetch(
          `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${API_KEY}`
        );
        if (!res.ok) { errors++; return; }
        const json = await res.json();
        const r = json.results;
        if (!r) return;

        const updateData: Record<string, unknown> = {};
        if (r.sic_description) updateData.industry = r.sic_description;

        // Determine sector: use override if available, else derive from SIC code
        if (SECTOR_OVERRIDES[ticker]) {
          updateData.sector = SECTOR_OVERRIDES[ticker];
        } else if (r.sic_code) {
          updateData.sector = sicToSector(r.sic_code);
        }

        if (r.market_cap) updateData.market_cap = Math.round(r.market_cap);
        if (r.name) updateData.name = r.name;

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase
            .from("stocks")
            .update(updateData)
            .eq("symbol", ticker);
          if (error) { errors++; } else { updated++; }
        }
      } catch { errors++; }
    });
    await Promise.all(fetches);
    if (i + BATCH < tickers.length) await delay(1200);
  }

  const { count } = await supabase
    .from("stocks")
    .select("symbol", { count: "exact", head: true })
    .or("sector.is.null,industry.is.null");

  return new Response(
    JSON.stringify({ updated, errors, remaining: count }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
