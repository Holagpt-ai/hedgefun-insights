import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  etSessionDate,
  mapPolygonMovers,
  moverFromExtendedObservation,
  moverFromPolygonTicker,
  polygonTickersFromResponse,
  presentCanonicalMovers,
  type CanonicalMover,
  type MoverCategory,
  type MoverSession,
  SOURCE_AFTER_HOURS_FEED,
} from "../../markets/movers-integrity";

export async function fetchMarketDataTickers(
  kind: "gainers" | "losers",
  env: { url: string; key: string },
): Promise<unknown> {
  if (!env.url || !env.key) return [];
  const url = `${env.url.replace(/\/$/, "")}/functions/v1/market-data?type=${kind}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.key}`,
      apikey: env.key,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export function sessionForCategory(category: MoverCategory): MoverSession {
  if (category === "premarket") return "premarket";
  if (category === "afterhours") return "afterhours";
  return "regular";
}

export function canonicalizeLiveTickers(
  payload: unknown,
  category: MoverCategory,
  nowMs: number = Date.now(),
): CanonicalMover[] {
  const session = sessionForCategory(category);
  const tickers = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === "object" && Array.isArray((payload as { tickers?: unknown }).tickers)
      ? (payload as { tickers: unknown[] }).tickers
      : []);
  return tickers.map((t) => moverFromPolygonTicker(t, session, nowMs));
}

export function presentValidatedMovers(
  movers: CanonicalMover[],
  category: MoverCategory,
  limit: number,
  nowMs: number = Date.now(),
) {
  return presentCanonicalMovers(movers, category, limit, nowMs);
}

export default defineTool({
  name: "get_market_movers",
  title: "Get market movers",
  description: "List today's top market movers (gainers, losers, most active, pre-market, or after-hours) from HedgeFun's data.",
  inputSchema: {
    type: z.enum(["gainer", "loser", "active", "premarket", "afterhours"]).describe("Which mover category to return."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results, default 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ type, limit }) => {
    const env = {
      url: process.env.SUPABASE_URL ?? "",
      key: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    };
    const supabase = createClient(env.url, env.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cap = limit ?? 10;
    const nowMs = Date.now();

    if (type === "afterhours") {
      const [{ data: stateRows }, { data: resultRows, error }] = await Promise.all([
        supabase.from("after_hours_feed_state").select("state_key,generation_id,status,session_date,synced_at").eq("state_key", "current").limit(1),
        supabase.from("after_hours_mover_results").select("generation_id,side,rank,symbol,company_name,extended_last,regular_close,change_percent,volume,provider_as_of"),
      ]);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      const state = (stateRows ?? [])[0] as { generation_id?: string; status?: string } | undefined;
      const gen = typeof state?.generation_id === "string" ? state.generation_id : null;
      const validated = (resultRows ?? [])
        .filter((r) => gen && r.generation_id === gen)
        .map((r) =>
          moverFromExtendedObservation({
            symbol: r.symbol,
            name: r.company_name,
            extendedLast: r.extended_last,
            regularClose: r.regular_close,
            volume: r.volume,
            providerAsOf: r.provider_as_of,
            changePercent: r.change_percent,
            source: SOURCE_AFTER_HOURS_FEED,
          }, nowMs),
        );
      const presented = presentValidatedMovers(validated, "afterhours", cap, nowMs);
      return {
        content: [{ type: "text", text: JSON.stringify(presented.movers) }],
        structuredContent: { movers: presented.movers, status: presented.status },
      };
    }

    const kinds: Array<"gainers" | "losers"> =
      type === "loser" ? ["losers"] : type === "gainer" ? ["gainers"] : ["gainers", "losers"];
    const payloads = await Promise.all(kinds.map((k) => fetchMarketDataTickers(k, env)));
    const validated = payloads.flatMap((p) => canonicalizeLiveTickers(p, type, nowMs));
    if (type === "active") {
      const { rows } = mapPolygonMovers(
        payloads.flatMap((p) => polygonTickersFromResponse(p)),
        "regular",
        { nowMs, sort: "volume_desc" },
      );
      const movers = rows.slice(0, cap).map((r) => ({
        symbol: r.symbol,
        name: r.name,
        price: r.price,
        change_percent: r.changePercent,
        volume: r.volume,
        session_date: etSessionDate(nowMs),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(movers) }],
        structuredContent: { movers, status: movers.length > 0 ? "available" : "empty" },
      };
    }
    const presented = presentValidatedMovers(validated, type, cap, nowMs);
    return {
      content: [{ type: "text", text: JSON.stringify(presented.movers) }],
      structuredContent: { movers: presented.movers, status: presented.status },
    };
  },
});
