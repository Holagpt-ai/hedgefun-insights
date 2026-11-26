import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildEconomicRowsFromFinnhubItems,
  economicSyncDateWindow,
  parseFinnhubEconomicCalendarPayload,
} from "../_shared/economic/finnhub-economic-calendar.ts";
import { upsertEconomicEventBatches } from "../_shared/economic/persist-economic-events.ts";
import { timingSafeMatch } from "../_shared/timing-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logSync(event: string, fields: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ msg: "sync-economic-calendar", event, ...fields }));
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

type SyncBody = { from?: string; to?: string; country?: string };

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
      return new Response(
        JSON.stringify({
          error: "config_error",
          reason: "FINNHUB_API_KEY not set",
          required_env: ["FINNHUB_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SYNC_SECRET"],
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as SyncBody;
    const window = economicSyncDateWindow();
    const from = typeof body.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : window.from;
    const to = typeof body.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.to) ? body.to : window.to;

    const url =
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${finnhubKey}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const classified = res.status === 401 || res.status === 403
        ? "provider_auth"
        : res.status === 429
        ? "provider_rate_limit"
        : "provider_http";
      logSync("provider_http_error", { finnhub_status: res.status, class: classified, elapsed_ms: Date.now() - started });
      return new Response(JSON.stringify({ error: classified, status: res.status }), {
        status: res.status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parseFinnhubEconomicCalendarPayload(json);
    if (parsed.providerError) {
      logSync("provider_payload_error", { reason: parsed.providerError, elapsed_ms: Date.now() - started });
      return new Response(JSON.stringify({ error: "finnhub_payload_error", reason: parsed.providerError }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const countryFilter = typeof body.country === "string" && body.country.trim()
      ? body.country.trim().toUpperCase()
      : null;

    const filtered = countryFilter
      ? parsed.items.filter((i) => (i.country ?? "").toUpperCase() === countryFilter)
      : parsed.items;

    const built = buildEconomicRowsFromFinnhubItems(filtered);
    const fetchedAt = new Date().toISOString();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const sb = createClient(supabaseUrl, serviceRole);

    const persist = await upsertEconomicEventBatches({
      supabase: sb,
      rows: built.rows,
      fetchedAt,
    });

    logSync("complete", {
      provider_count: built.providerCount,
      rejected: built.rejected,
      upserted: persist.upserted,
      from,
      to,
      elapsed_ms: Date.now() - started,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        provider: "finnhub",
        endpoint: "/api/v1/calendar/economic",
        window: { from, to },
        provider_count: built.providerCount,
        rejected: built.rejected,
        upserted: persist.upserted,
        fetched_at: fetchedAt,
        coverage_note: countryFilter ? `filtered_country=${countryFilter}` : "all_countries",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logSync("fatal", { message, elapsed_ms: Date.now() - started });
    return new Response(JSON.stringify({ error: "sync_failed", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});