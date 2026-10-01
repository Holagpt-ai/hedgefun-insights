import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createSecRequester,
  emptySecSummary,
  parseCompanyTickersExchangeJson,
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
} from "../sec-edgar/ingest.ts";
import { loadCompanyUniverse } from "./company-universe.ts";
import { loadPolygonMinuteBars } from "./event-bars.ts";
import { handleCatalystIntelRequest } from "./http.ts";
import { createSupabaseIntelStore } from "./supabase-store.ts";
import type { BotId, MarketObservation } from "./types.ts";

function serveBot(bot: BotId): void {
  serve((req) => {
    const env = (key: string) => Deno.env.get(key);
    return handleCatalystIntelRequest(req, {
      bot,
      env,
      openStore: () => {
        const url = env("SUPABASE_URL") ?? "";
        const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (!url || !key) throw new Error("missing_supabase");
        return Promise.resolve(createSupabaseIntelStore(createClient(url, key)));
      },
      loadCikMap: bot === "sec" ? async () => {
        const summary = emptySecSummary();
        const userAgent = env("SEC_USER_AGENT") ?? "";
        const secFetch = createSecRequester(userAgent, summary);
        const result = await secFetch(SEC_COMPANY_TICKERS_EXCHANGE_URL);
        if (!result.ok || !result.json) throw new Error("cik_map");
        const parsed = parseCompanyTickersExchangeJson(result.json);
        const out = new Map<string, string[]>();
        for (const [cik, rows] of parsed) out.set(cik, rows.map((row: { ticker: string }) => row.ticker));
        return out;
      } : undefined,
      loadCompanies: bot === "reactions" ? undefined : async () => {
        const url = env("SUPABASE_URL") ?? "";
        const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (!url || !key) throw new Error("missing_supabase");
        return loadCompanyUniverse(createClient(url, key));
      },
      loadObservation: bot === "reactions" ? async (symbol: string): Promise<MarketObservation | null> => {
        const url = env("SUPABASE_URL") ?? "";
        const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const store = createSupabaseIntelStore(createClient(url, key));
        const rows = await store.loadMarketObservations([symbol]);
        return rows.find((row: MarketObservation) => row.symbol === symbol.toUpperCase()) ?? null;
      } : undefined,
      loadReferenceBars: bot === "reactions" ? async (symbol: string, eventAtIso: string) => {
        const apiKey = env("POLYGON_API_KEY") ?? "";
        if (!apiKey) return [];
        return loadPolygonMinuteBars({ symbol, eventAtIso, apiKey });
      } : undefined,
    });
  });
}

export { serveBot };
