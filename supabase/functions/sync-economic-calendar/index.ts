import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertEconomicSyncWindow,
  buildEconomicRowsFromFinnhubItems,
  economicSyncDateWindow,
  ECONOMIC_FETCH_TIMEOUT_MS,
  parseFinnhubEconomicCalendarPayload,
} from "../_shared/economic/finnhub-economic-calendar.ts";
import { upsertEconomicEventBatches } from "../_shared/economic/persist-economic-events.ts";
import {
  summarizeUsFallbackCatalog,
  US_ECONOMIC_RELEASE_CATALOG,
} from "../_shared/economic/us-economic-release-fallback.ts";
import { verifyFinnhubEconomicEntitlement } from "../_shared/economic/verify-finnhub-economic-entitlement.ts";
import { timingSafeMatchAny } from "../_shared/timing-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logSync(event: string, fields: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ msg: "sync-economic-calendar", event, ...fields }));
}

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/token=[^&\s]+/gi, "token=***").slice(0, 240);
}

async function authorize(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!syncSecret && !serviceRole) return false;
  return await timingSafeMatchAny(auth, [
    syncSecret ? `Bearer ${syncSecret}` : null,
    serviceRole ? `Bearer ${serviceRole}` : null,
  ]);
}

type SyncBody = { from?: string; to?: string; country?: string; verify_only?: boolean };

async function recordSyncStatus(
  sb: ReturnType<typeof createClient>,
  patch: Record<string, unknown>,
): Promise<void> {
  await sb.from("economic_sync_status").upsert({
    id: 1,
    updated_at: new Date().toISOString(),
    ...patch,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY") ?? "";
    const enabled = (Deno.env.get("FINNHUB_ECONOMIC_ENABLED") ?? "").toLowerCase() === "true";
    const probe = enabled ? await verifyFinnhubEconomicEntitlement(finnhubKey) : {
      ok: false,
      http_status: null,
      class: "missing_key" as const,
      sample_count: 0,
      message: "FINNHUB_ECONOMIC_ENABLED is not true — Finnhub ingest disabled",
    };
    return new Response(
      JSON.stringify({
        finnhub_economic_enabled: enabled,
        entitlement: probe,
        us_fallback_catalog: US_ECONOMIC_RELEASE_CATALOG.map((e) => ({
          event_name: e.event_name,
          source_url: e.source_url,
          schedule_note: e.schedule_note,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
    const body = (await req.json().catch(() => ({}))) as SyncBody;

    if (body.verify_only === true) {
      const probe = await verifyFinnhubEconomicEntitlement(Deno.env.get("FINNHUB_API_KEY"));
      return new Response(JSON.stringify({ verify_only: true, entitlement: probe }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finnhubEnabled = (Deno.env.get("FINNHUB_ECONOMIC_ENABLED") ?? "").toLowerCase() === "true";
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY") ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ error: "config_error", reason: "missing_supabase_service_role" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceRole);
    const window = economicSyncDateWindow();
    const from = typeof body.from === "string" ? body.from : window.from;
    const to = typeof body.to === "string" ? body.to : window.to;

    try {
      assertEconomicSyncWindow(from, to);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "invalid_window";
      return new Response(JSON.stringify({ error: "invalid_window", reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!finnhubEnabled) {
      logSync("finnhub_disabled", { us_fallback: summarizeUsFallbackCatalog().slice(0, 120) });
      await recordSyncStatus(sb, {
        provider: "us_catalog_only",
        last_error_class: "finnhub_disabled",
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "provider_disabled",
          reason: "FINNHUB_ECONOMIC_ENABLED is not true",
          us_fallback_catalog_count: US_ECONOMIC_RELEASE_CATALOG.length,
          activation:
            "Set FINNHUB_ECONOMIC_ENABLED=true after Finnhub economic calendar entitlement is verified (GET /sync-economic-calendar).",
        }),
        { status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!finnhubKey) {
      return new Response(
        JSON.stringify({
          error: "config_error",
          reason: "FINNHUB_API_KEY not set",
          required_env: ["FINNHUB_API_KEY", "FINNHUB_ECONOMIC_ENABLED", "SUPABASE_SERVICE_ROLE_KEY", "SYNC_SECRET"],
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url =
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${finnhubKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ECONOMIC_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const classified = res.status === 401 || res.status === 403
        ? "provider_auth"
        : res.status === 429
        ? "provider_rate_limit"
        : "provider_http";
      await recordSyncStatus(sb, { provider: "finnhub", last_error_class: classified });
      logSync("provider_http_error", { finnhub_status: res.status, class: classified, elapsed_ms: Date.now() - started });
      return new Response(JSON.stringify({ error: classified, status: res.status }), {
        status: res.status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = parseFinnhubEconomicCalendarPayload(json);
    if (parsed.providerError) {
      await recordSyncStatus(sb, { provider: "finnhub", last_error_class: "provider_payload" });
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

    const persist = await upsertEconomicEventBatches({
      supabase: sb,
      rows: built.rows,
      fetchedAt,
    });

    await recordSyncStatus(sb, {
      provider: "finnhub",
      last_success_at: fetchedAt,
      last_window_from: from,
      last_window_to: to,
      last_row_count: built.rows.length,
      last_error_class: null,
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
    const message = sanitizeErrorMessage(err);
    logSync("fatal", { message, elapsed_ms: Date.now() - started });
    return new Response(JSON.stringify({ error: "sync_failed", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});