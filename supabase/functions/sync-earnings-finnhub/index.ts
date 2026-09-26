import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildEarningsRowsFromFinnhubItems,
  finnhubEarningsDateWindow,
  parseFinnhubEarningsCalendarPayload,
} from "../_shared/earnings/finnhub-calendar.ts";
import { upsertEarningsCalendarBatches } from "../_shared/earnings/persist-earnings-calendar.ts";
import { timingSafeMatch } from "../_shared/timing-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logSync(event: string, fields: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ msg: "sync-earnings-finnhub", event, ...fields }));
}

async function authorize(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (syncSecret) {
    return await timingSafeMatch(auth, `Bearer ${syncSecret}`);
  }
  return await timingSafeMatch(auth, serviceRole ? `Bearer ${serviceRole}` : "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!(await authorize(req))) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const started = Date.now();
  try {
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY") ?? "";
    if (!finnhubKey) {
      logSync("config_error", { reason: "missing_finnhub_api_key" });
      return new Response(JSON.stringify({ error: "FINNHUB_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const sb = createClient(supabaseUrl, serviceRole);

    const window = finnhubEarningsDateWindow();
    const url =
      `https://finnhub.io/api/v1/calendar/earnings?from=${window.from}&to=${window.to}&token=${finnhubKey}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      logSync("provider_http_error", {
        finnhub_status: res.status,
        elapsed_ms: Date.now() - started,
      });
      return new Response(JSON.stringify({
        error: "finnhub_http_error",
        status: res.status,
      }), {
        status: res.status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parseFinnhubEarningsCalendarPayload(json);
    if (parsed.providerError) {
      logSync("provider_payload_error", {
        reason: parsed.providerError,
        elapsed_ms: Date.now() - started,
      });
      return new Response(JSON.stringify({
        error: "finnhub_payload_error",
        reason: parsed.providerError,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const built = buildEarningsRowsFromFinnhubItems(parsed.items);
    let namedRows = built.rows;

    if (namedRows.length > 0) {
      const symbols = [...new Set(namedRows.map((row) => row.symbol))];
      const { data: stockRows } = await sb
        .from("stocks")
        .select("symbol, name")
        .in("symbol", symbols);
      const stockNames = new Map<string, string>(
        (stockRows ?? []).map((s: { symbol: string; name: string }) => [s.symbol, s.name]),
      );
      namedRows = namedRows.map((row) => ({
        ...row,
        company_name: stockNames.get(row.symbol) ?? row.symbol,
      }));
    }

    const persist = await upsertEarningsCalendarBatches({ supabase: sb, rows: namedRows });

    logSync("ok", {
      provider_count: built.providerCount,
      upserted: persist.upserted,
      rejected: built.rejected,
      sanitized_fields: built.sanitizedFields,
      elapsed_ms: Date.now() - started,
    });

    return new Response(JSON.stringify({
      ok: true,
      fetched: built.providerCount,
      upserted: persist.upserted,
      rejected: built.rejected,
      sanitized_fields: built.sanitizedFields,
      window,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logSync("failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      elapsed_ms: Date.now() - started,
    });
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "unknown",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
