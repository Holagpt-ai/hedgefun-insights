import {
  authorizeScreenerSync,
  type EnvReader,
} from "../_shared/screeners/auth.ts";
import {
  fetchJsonBounded,
  type FetchLike,
  parseTickersPayload,
  ProviderUnavailableError,
} from "../_shared/screeners/provider.ts";
import type { CalendarExceptionRow } from "../_shared/markets/session-schedule.ts";
import {
  type AhClassifiedRow,
  applyNames,
  classifyFullMarketAfterHours,
  decideAfterHoursPublish,
} from "../_shared/markets/after-hours-movers.ts";
import { resolveScheduleAt } from "../_shared/markets/session-schedule.ts";

export const REPLACE_AH_RPC = "replace_after_hours_generation_v1";
const BASE = "https://api.polygon.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type DbSelectResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export type DbQuery = {
  eq: (col: string, value: string) => DbQuery;
  in: (col: string, values: string[]) => DbQuery;
  then: (
    onfulfilled?: ((value: DbSelectResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

export type DbClient = {
  from: (table: string) => { select: (cols: string) => DbQuery };
  rpc: (
    fn: string,
    args: {
      p_generation_id: string;
      p_rows: AhClassifiedRow[];
      p_session_date: string;
      p_synced_at: string;
      p_status: "available" | "empty";
    },
  ) => Promise<{ data: number | null; error: { message: string } | null }>;
};

export type AhSyncDeps = {
  env: EnvReader;
  fetch: FetchLike;
  createClient: (url: string, key: string) => DbClient;
  nowIso: () => string;
  nowMs?: () => number;
  newGenerationId?: () => string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseException(
  raw: Record<string, unknown>,
): CalendarExceptionRow | null {
  if (typeof raw.session_date !== "string") return null;
  if (raw.market_status !== "closed" && raw.market_status !== "early_close") {
    return null;
  }
  if (
    typeof raw.regular_open_et !== "string" ||
    typeof raw.regular_close_et !== "string" ||
    typeof raw.after_hours_end_et !== "string"
  ) {
    return null;
  }
  const holiday = raw.holiday_name;
  if (holiday !== null && typeof holiday !== "string") return null;
  return {
    session_date: raw.session_date,
    market_status: raw.market_status,
    regular_open_et: raw.regular_open_et,
    regular_close_et: raw.regular_close_et,
    after_hours_end_et: raw.after_hours_end_et,
    holiday_name: holiday,
  };
}

export async function handleSyncAfterHoursMovers(
  req: Request,
  deps: AhSyncDeps,
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
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const apiKey = deps.env("POLYGON_API_KEY") ?? "";
  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceRole = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!apiKey || !supabaseUrl || !serviceRole) {
    return json({ error: "misconfigured" }, 500);
  }

  const nowMs = (deps.nowMs ?? (() => Date.now()))();
  const syncedAt = deps.nowIso();
  const sb = deps.createClient(supabaseUrl, serviceRole);

  let exceptions: CalendarExceptionRow[] | null = [];
  try {
    const cal = await sb
      .from("market_session_calendar")
      .select(
        "session_date,market_status,regular_open_et,regular_close_et,after_hours_end_et,holiday_name",
      );
    if (cal.error || !cal.data) exceptions = null;
    else {
      exceptions = [];
      for (const item of cal.data) {
        const parsed = parseException(item);
        if (parsed) exceptions.push(parsed);
      }
    }
  } catch {
    exceptions = null;
  }

  let tickers: unknown[];
  try {
    const body = await fetchJsonBounded(
      `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      { fetchImpl: deps.fetch },
    );
    tickers = parseTickersPayload(body);
  } catch (e) {
    if (!(e instanceof ProviderUnavailableError)) {
      console.error("[sync-after-hours-movers] provider error");
    }
    return json({ ok: true, retained: true, reason: "provider_unavailable" });
  }

  const schedule = resolveScheduleAt(nowMs, exceptions);
  const classified = schedule
    ? classifyFullMarketAfterHours(tickers as never, schedule)
    : [];
  const decision = decideAfterHoursPublish({
    nowMs,
    exceptions,
    classified,
    providerFailed: false,
  });

  if (decision.action === "retain") {
    return json({ ok: true, retained: true, reason: decision.reason });
  }

  const symbols = decision.rows.map((r) => r.symbol);
  const names = new Map<string, string>();
  if (symbols.length > 0) {
    const stockRes = await sb.from("stocks").select("symbol, name").in(
      "symbol",
      symbols,
    );
    for (const row of stockRes.data ?? []) {
      if (
        typeof row.symbol === "string" && typeof row.name === "string" &&
        row.name
      ) {
        names.set(row.symbol, row.name);
      }
    }
  }
  const rows = applyNames(decision.rows, names);
  const generationId = (deps.newGenerationId ?? (() => crypto.randomUUID()))();
  const { data: inserted, error } = await sb.rpc(REPLACE_AH_RPC, {
    p_generation_id: generationId,
    p_rows: rows,
    p_session_date: decision.sessionDate,
    p_synced_at: syncedAt,
    p_status: decision.status,
  });
  if (error) {
    console.error("[sync-after-hours-movers] replace generation failed");
    return json({ error: "database_error" }, 500);
  }
  if (inserted !== rows.length) {
    return json({ error: "database_error" }, 500);
  }

  return json({
    ok: true,
    retained: false,
    generation_id: generationId,
    session_date: decision.sessionDate,
    status: decision.status,
    rows_inserted: inserted,
    gainer_count: rows.filter((r) => r.side === "gainer").length,
    loser_count: rows.filter((r) => r.side === "loser").length,
    provider_as_of_min: decision.providerAsOfMin,
    provider_as_of_max: decision.providerAsOfMax,
    synced_at: syncedAt,
  });
}
