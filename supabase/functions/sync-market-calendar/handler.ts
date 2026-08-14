// Injectable market-calendar sync runner.

import {
  authorizeScreenerSync,
  type EnvReader,
} from "../_shared/screeners/auth.ts";
import {
  fetchJsonBounded,
  type FetchLike,
  ProviderUnavailableError,
} from "../_shared/screeners/provider.ts";
import {
  CALENDAR_SOURCE,
  parseUpcomingMarketStatus,
  type PersistedCalendarExceptionRow,
  stampCalendarSourceRows,
} from "../_shared/markets/session-calendar.ts";
import { easternParts } from "../_shared/markets/session-schedule.ts";

export const REPLACE_CALENDAR_RPC =
  "replace_market_session_calendar_exceptions_v1";
const BASE = "https://api.polygon.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type DbClient = {
  rpc: (
    fn: string,
    args: {
      p_rows: PersistedCalendarExceptionRow[];
      p_as_of_date: string;
      p_provider_as_of: string;
    },
  ) => Promise<{ data: number | null; error: { message: string } | null }>;
};

export type CalendarSyncDeps = {
  env: EnvReader;
  fetch: FetchLike;
  createClient: (url: string, key: string) => DbClient;
  nowIso: () => string;
  nowMs?: () => number;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleSyncMarketCalendar(
  req: Request,
  deps: CalendarSyncDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const auth = await authorizeScreenerSync(
    req.headers.get("Authorization"),
    deps.env,
  );
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apiKey = deps.env("POLYGON_API_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !apiKey) {
    console.error("[sync-market-calendar] server_misconfigured");
    return json({ error: "server_misconfigured" }, 500);
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  const nowIso = deps.nowIso();
  const parts = easternParts(nowMs);
  if (!parts) {
    console.error("[sync-market-calendar] eastern_clock_unavailable");
    return json({ error: "calendar_unavailable" }, 503);
  }

  const upcomingUrl = new URL(`${BASE}/v1/marketstatus/upcoming`);
  upcomingUrl.searchParams.set("apiKey", apiKey);

  let body: unknown;
  try {
    body = await fetchJsonBounded(upcomingUrl.toString(), {}, {
      fetchImpl: deps.fetch,
    });
  } catch (e) {
    if (e instanceof ProviderUnavailableError) {
      console.error("[sync-market-calendar] provider_unavailable");
      return json({ error: "provider_unavailable" }, 503);
    }
    console.error("[sync-market-calendar] provider_unavailable");
    return json({ error: "provider_unavailable" }, 503);
  }

  const parsed = parseUpcomingMarketStatus(body, parts.date);
  if (!parsed.ok) {
    console.error("[sync-market-calendar] provider_response_invalid");
    return json({ error: "provider_response_invalid" }, 503);
  }

  const sb = deps.createClient(supabaseUrl, serviceKey);
  const p_rows = stampCalendarSourceRows(parsed.rows);
  const { data, error } = await sb.rpc(REPLACE_CALENDAR_RPC, {
    p_rows,
    p_as_of_date: parts.date,
    p_provider_as_of: nowIso,
  });
  if (error) {
    console.error("[sync-market-calendar] persist_failed");
    return json({ error: "persist_failed" }, 500);
  }

  return json({
    ok: true,
    source: CALENDAR_SOURCE,
    as_of_date: parts.date,
    rows: parsed.rows.length,
    upserted: data ?? parsed.rows.length,
  });
}
