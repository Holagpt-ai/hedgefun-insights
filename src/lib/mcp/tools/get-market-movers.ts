import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { isAfterHoursGenerationStale } from "../../after-hours-feed";
import {
  moverFromExtendedObservation,
  moverFromPolygonTicker,
  polygonTickersFromResponse,
  presentCanonicalMovers,
  type CanonicalMover,
  type MoverCategory,
  type MoverSession,
  SOURCE_AFTER_HOURS_FEED,
} from "../../markets/movers-integrity";

const MARKET_DATA_TIMEOUT_MS = 8_000;

/** Safe user-facing copy. Never include credentials, provider bodies, or exception text. */
export const MOVER_UNAVAILABLE_MESSAGE = "Market movers are currently unavailable.";
export const MOVER_STALE_MESSAGE = "Showing last successful market movers. This data may not be current.";

export type MoverToolStatus = "available" | "empty" | "unavailable" | "stale";
export type MarketDataFreshness = "current" | "last_success" | "unavailable";
export type MoverToolReason =
  | "auth_failed"
  | "timeout"
  | "network_failure"
  | "upstream_error"
  | "malformed_payload"
  | "last_success"
  | "missing_evidence";

export type PresentedMover = {
  symbol: string;
  name: string;
  price: number;
  change_percent: number;
  volume: number | null;
  session_date: string | null;
  type: MoverCategory;
};

export type MarketDataFetchResult = {
  tickers: unknown[];
  unavailable: boolean;
  freshness: MarketDataFreshness;
  reason: MoverToolReason | null;
};

export type MoverToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    movers: PresentedMover[];
    status: MoverToolStatus;
    reason?: MoverToolReason;
    message?: string;
    freshness?: "last_success";
  };
};

const UNAVAILABLE: Pick<MarketDataFetchResult, "tickers" | "unavailable" | "freshness"> = {
  tickers: [],
  unavailable: true,
  freshness: "unavailable",
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

export function reasonFromHttpStatus(status: number): MoverToolReason {
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 408) return "timeout";
  return "upstream_error";
}

export function classifyFetchFailure(err: unknown): MarketDataFetchResult {
  if (isTimeoutError(err)) {
    return { ...UNAVAILABLE, reason: "timeout" };
  }
  return { ...UNAVAILABLE, reason: "network_failure" };
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  return name === "TimeoutError" || name === "AbortError";
}

export function parseMarketDataPayload(status: number, body: unknown): MarketDataFetchResult {
  if (!Number.isFinite(status) || status < 200 || status >= 300) {
    return { ...UNAVAILABLE, reason: reasonFromHttpStatus(status) };
  }
  if (isPlainObject(body) && body.status === "ERROR") {
    return { ...UNAVAILABLE, reason: "upstream_error" };
  }
  if (isPlainObject(body) && (body.freshness === "last_success" || body.status === "stale")) {
    if (!Array.isArray(body.tickers)) {
      return { ...UNAVAILABLE, reason: "missing_evidence" };
    }
    return {
      tickers: polygonTickersFromResponse(body),
      unavailable: false,
      freshness: "last_success",
      reason: "last_success",
    };
  }
  if (Array.isArray(body) || (isPlainObject(body) && Array.isArray(body.tickers))) {
    return {
      tickers: polygonTickersFromResponse(body),
      unavailable: false,
      freshness: "current",
      reason: null,
    };
  }
  return { ...UNAVAILABLE, reason: "malformed_payload" };
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

export async function fetchMarketDataTickers(
  kind: "gainers" | "losers",
  env: { url: string; key: string },
  fetchImpl: typeof fetch = fetch,
): Promise<MarketDataFetchResult> {
  if (!env.url || !env.key) return { ...UNAVAILABLE, reason: "missing_evidence" };
  const url = `${env.url.replace(/\/$/, "")}/functions/v1/market-data?type=${kind}`;
  try {
    const signal = timeoutSignal(MARKET_DATA_TIMEOUT_MS);
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${env.key}`,
        apikey: env.key,
      },
      ...(signal ? { signal } : {}),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (!res.ok) return { ...UNAVAILABLE, reason: reasonFromHttpStatus(res.status) };
      return { ...UNAVAILABLE, reason: "malformed_payload" };
    }
    return parseMarketDataPayload(res.status, body);
  } catch (err) {
    return classifyFetchFailure(err);
  }
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
  const tickers = polygonTickersFromResponse(payload);
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

const REASON_PRIORITY: MoverToolReason[] = [
  "auth_failed",
  "timeout",
  "network_failure",
  "malformed_payload",
  "upstream_error",
  "missing_evidence",
  "last_success",
];

export function mergeMarketDataFetches(results: MarketDataFetchResult[]): MarketDataFetchResult {
  if (results.length === 0) return { ...UNAVAILABLE, reason: "missing_evidence" };
  const current = results.filter((r) => r.freshness === "current");
  if (current.length > 0) {
    return {
      tickers: current.flatMap((r) => r.tickers),
      unavailable: false,
      freshness: "current",
      reason: null,
    };
  }
  const lastSuccess = results.filter((r) => r.freshness === "last_success");
  if (lastSuccess.length > 0) {
    return {
      tickers: lastSuccess.flatMap((r) => r.tickers),
      unavailable: false,
      freshness: "last_success",
      reason: "last_success",
    };
  }
  const reasons = results.map((r) => r.reason).filter((r): r is MoverToolReason => r !== null);
  const reason = REASON_PRIORITY.find((code) => reasons.includes(code)) ?? "upstream_error";
  return { ...UNAVAILABLE, reason };
}

export function composeMoverFeedStatus(
  fetchState: MarketDataFreshness,
  qualifyingCount: number,
): MoverToolStatus {
  if (fetchState === "unavailable") return "unavailable";
  if (fetchState === "last_success") return "stale";
  return qualifyingCount > 0 ? "available" : "empty";
}

export function buildMoverToolResponse(
  movers: PresentedMover[],
  fetchState: MarketDataFreshness,
  reason: MoverToolReason | null,
): MoverToolResponse {
  const status = composeMoverFeedStatus(fetchState, movers.length);
  const presented = status === "unavailable" ? [] : movers;
  const structuredContent: MoverToolResponse["structuredContent"] = {
    movers: presented,
    status,
  };
  if (status === "unavailable") {
    structuredContent.reason = reason ?? "upstream_error";
    structuredContent.message = MOVER_UNAVAILABLE_MESSAGE;
  } else if (status === "stale") {
    structuredContent.reason = "last_success";
    structuredContent.message = MOVER_STALE_MESSAGE;
    structuredContent.freshness = "last_success";
  }
  return {
    content: [{ type: "text", text: JSON.stringify(presented) }],
    structuredContent,
  };
}

export function assembleMarketMoversResponse(
  payloads: MarketDataFetchResult[],
  category: MoverCategory,
  limit: number,
  nowMs: number,
): MoverToolResponse {
  const merged = mergeMarketDataFetches(payloads);
  if (merged.freshness === "unavailable") {
    return buildMoverToolResponse([], "unavailable", merged.reason);
  }
  const validated = canonicalizeLiveTickers(merged.tickers, category, nowMs);
  const presented = presentValidatedMovers(validated, category, limit, nowMs);
  return buildMoverToolResponse(presented.movers, merged.freshness, merged.reason);
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
      const [{ data: stateRows, error: stateError }, { data: resultRows, error }] = await Promise.all([
        supabase.from("after_hours_feed_state").select("state_key,generation_id,status,session_date,synced_at").eq("state_key", "current").limit(1),
        supabase.from("after_hours_mover_results").select("generation_id,side,rank,symbol,company_name,extended_last,regular_close,change_percent,volume,provider_as_of"),
      ]);
      if (stateError || error) {
        return buildMoverToolResponse([], "unavailable", "upstream_error");
      }
      const state = (stateRows ?? [])[0] as { generation_id?: string; status?: string; synced_at?: string } | undefined;
      const gen = typeof state?.generation_id === "string" ? state.generation_id : null;
      if (!gen) {
        return buildMoverToolResponse([], "unavailable", "missing_evidence");
      }
      const validated = (resultRows ?? [])
        .filter((r) => r.generation_id === gen)
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
      const syncedAt = typeof state?.synced_at === "string" ? state.synced_at : "";
      const stale = syncedAt !== "" && isAfterHoursGenerationStale(syncedAt, nowMs);
      if (stale) {
        return buildMoverToolResponse(presented.movers, "last_success", "last_success");
      }
      return buildMoverToolResponse(presented.movers, "current", null);
    }

    const kinds: Array<"gainers" | "losers"> =
      type === "loser" ? ["losers"] : type === "gainer" ? ["gainers"] : ["gainers", "losers"];
    const payloads = await Promise.all(kinds.map((k) => fetchMarketDataTickers(k, env)));
    return assembleMarketMoversResponse(payloads, type, cap, nowMs);
  },
});
