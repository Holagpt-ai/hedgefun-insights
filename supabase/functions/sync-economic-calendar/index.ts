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
import { US_ECONOMIC_RELEASE_CATALOG } from "../_shared/economic/us-economic-release-fallback.ts";
import {
  fetchUsGovernmentEconomicReleases,
  summarizeUsGovernmentSyncOutcome,
} from "../_shared/economic/us-government-economic-ingest.ts";
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
  const { error } = await sb.from("economic_sync_status").upsert({
    id: 1,
    updated_at: new Date().toISOString(),
    ...patch,
  });
  if (error) throw new Error(`sync_status_persist_failed:${error.message}`);
}

async function readCachedSyncStatus(
  sb: ReturnType<typeof createClient>,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb
    .from("economic_sync_status")
    .select("provider,last_success_at,last_window_from,last_window_to,last_row_count,last_error_class,updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const finnhubEnabled = (Deno.env.get("FINNHUB_ECONOMIC_ENABLED") ?? "").toLowerCase() === "true";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let cachedStatus: Record<string, unknown> | null = null;
    if (supabaseUrl && serviceRole) {
      const sb = createClient(supabaseUrl, serviceRole);
      cachedStatus = await readCachedSyncStatus(sb);
    }
    return new Response(
      JSON.stringify({
        finnhub_economic_enabled: finnhubEnabled,
        finnhub_ingest: finnhubEnabled ? "active_when_sync_post_succeeds" : "disabled",
        entitlement_probe: "Use authorized POST {\"verify_only\":true} — GET does not call Finnhub.",
        sync_status: cachedStatus,
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

    const finnhubEnabled = (Deno.env.get("FINNHUB_ECONOMIC_ENABLED") ?? "").toLowerCase() === "true";

    if (!finnhubEnabled) {
      const gov = await fetchUsGovernmentEconomicReleases(from, to);
      const outcome = summarizeUsGovernmentSyncOutcome(gov);
      const fetchedAt = new Date().toISOString();

      if (!outcome.shouldPersistSuccessMetadata) {
        await recordSyncStatus(sb, {
          provider: "us_government",
          last_error_class: gov.errors.length ? gov.errors.join(",") : "all_sources_failed",
        });
        logSync("us_government_all_sources_failed", {
          errors: gov.errors.join(","),
          elapsed_ms: Date.now() - started,
        });
        return new Response(
          JSON.stringify({
            ok: false,
            provider: "us_government",
            window: { from, to },
            upserted: 0,
            sources_succeeded: gov.sourcesSucceeded,
            sources_failed: gov.sourcesFailed,
            fetch_errors: gov.errors,
            all_sources_failed: true,
            partial_coverage: false,
            finnhub_ingest: "disabled",
            sync_status_persisted: true,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const persist = gov.rows.length
        ? await upsertEconomicEventBatches({ supabase: sb, rows: gov.rows, fetchedAt })
        : { upserted: 0, batches: 0, failedBatches: 0 };

      await recordSyncStatus(sb, {
        provider: "us_government",
        last_success_at: fetchedAt,
        last_window_from: from,
        last_window_to: to,
        last_row_count: persist.upserted,
        last_error_class: gov.errors.length ? gov.errors.join(",") : null,
      });

      logSync("us_government_complete", {
        sources_succeeded: gov.sourcesSucceeded.join(","),
        sources_failed: gov.sourcesFailed.join(","),
        upserted: persist.upserted,
        partial_coverage: outcome.partialCoverage,
        errors: gov.errors.join(","),
        elapsed_ms: Date.now() - started,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          provider: "us_government",
          window: { from, to },
          upserted: persist.upserted,
          fetched_at: fetchedAt,
          sources_succeeded: gov.sourcesSucceeded,
          sources_failed: gov.sourcesFailed,
          partial_coverage: outcome.partialCoverage,
          all_sources_failed: false,
          fetch_errors: gov.errors,
          finnhub_ingest: "disabled",
          sync_status_persisted: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const finnhubKey = Deno.env.get("FINNHUB_API_KEY") ?? "";
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
        headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = parseFinnhubEconomicCalendarPayload(json);
    if (parsed.providerError) {
      await recordSyncStatus(sb, { provider: "finnhub", last_error_class: "provider_payload" });
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
    const persist = await upsertEconomicEventBatches({ supabase: sb, rows: built.rows, fetchedAt });

    await recordSyncStatus(sb, {
      provider: "finnhub",
      last_success_at: fetchedAt,
      last_window_from: from,
      last_window_to: to,
      last_row_count: persist.upserted,
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
        window: { from, to },
        provider_count: built.providerCount,
        rejected: built.rejected,
        upserted: persist.upserted,
        fetched_at: fetchedAt,
        sync_status_persisted: true,
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