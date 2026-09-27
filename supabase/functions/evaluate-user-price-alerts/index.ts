import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluatePriceAlert } from "../_shared/price-alerts/evaluate.ts";
import { fetchPolygonSnapshotQuote } from "../_shared/price-alerts/fetch-quote.ts";
import { observedAtMsToIso } from "../_shared/price-alerts/normalize-timestamp.ts";
import type { PriceAlertCondition, QuoteDataLatency } from "../_shared/price-alerts/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  condition_type: string;
  threshold: number;
  reference_price: number | null;
  status: string;
  recurrence: string;
  cooldown_minutes: number;
  armed: boolean;
  last_observed_price: number | null;
  last_triggered_at: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const polygonKey = Deno.env.get("POLYGON_API_KEY");

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: alerts, error: loadErr } = await admin
      .from("user_price_alerts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    if (loadErr) {
      return new Response(JSON.stringify({ error: loadErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (alerts ?? []) as AlertRow[];
    const symbols = [...new Set(rows.map((r) => r.symbol))];
    const quoteBySymbol = new Map<string, Awaited<ReturnType<typeof fetchPolygonSnapshotQuote>>>();

    if (polygonKey) {
      for (const symbol of symbols) {
        quoteBySymbol.set(symbol, await fetchPolygonSnapshotQuote(symbol, polygonKey));
      }
    }

    const now = Date.now();
    let evaluated = 0;
    let triggered = 0;

    for (const row of rows) {
      evaluated += 1;
      const quoteRaw = quoteBySymbol.get(row.symbol);
      const quote = quoteRaw ?? {
        price: 0,
        observedAtMs: now,
        latency: "unavailable" as QuoteDataLatency,
        sessionNote: "Quote unavailable.",
        rawContext: {},
      };

      const outcome = evaluatePriceAlert(
        {
          condition: row.condition_type as PriceAlertCondition,
          threshold: Number(row.threshold),
          referencePrice: row.reference_price != null ? Number(row.reference_price) : null,
          lastObservedPrice: row.last_observed_price != null ? Number(row.last_observed_price) : null,
          armed: row.armed,
          status: row.status as "active" | "paused",
          recurrence: row.recurrence as "one_time" | "recurring",
          cooldownMinutes: row.cooldown_minutes,
          lastTriggeredAtMs: row.last_triggered_at ? Date.parse(row.last_triggered_at) : null,
        },
        {
          price: quote.price,
          observedAtMs: quote.observedAtMs,
          latency: quote.latency,
          sessionNote: quote.sessionNote,
        },
        now,
      );

      const patch: Record<string, unknown> = {
        last_evaluated_at: new Date(now).toISOString(),
        last_observed_price: outcome.nextLastObservedPrice,
        reference_price: outcome.nextReferencePrice,
        armed: outcome.nextArmed,
        status: outcome.nextStatus,
        last_quote_price: quoteRaw?.price ?? null,
        last_quote_at: quoteRaw ? observedAtMsToIso(quoteRaw.observedAtMs) : null,
        data_latency: quoteRaw?.latency ?? "unavailable",
        market_context: quoteRaw?.rawContext ?? {},
      };

      if (outcome.shouldTrigger) {
        triggered += 1;
        patch.last_triggered_at = new Date(now).toISOString();

        const { data: triggerRow, error: trigErr } = await admin
          .from("user_price_alert_triggers")
          .insert({
            alert_id: row.id,
            user_id: userId,
            symbol: row.symbol,
            condition_type: row.condition_type,
            threshold: row.threshold,
            observed_price: quote.price,
            observed_move_pct: outcome.observedMovePct,
            quote_observed_at: quoteRaw ? observedAtMsToIso(quoteRaw.observedAtMs) : null,
            data_latency: quoteRaw?.latency ?? "unavailable",
            market_context: {
              sessionNote: quoteRaw?.sessionNote ?? null,
              ...(quoteRaw?.rawContext ?? {}),
            },
            delivery_channel: "in_app",
            delivery_status: "pending",
          })
          .select("id")
          .single();

        if (trigErr || !triggerRow) {
          patch.market_context = {
            ...(patch.market_context as object),
            lastDeliveryError: trigErr?.message ?? "trigger_insert_failed",
          };
        } else {
          const { error: deliverErr } = await admin
            .from("user_price_alert_triggers")
            .update({ delivery_status: "delivered", delivery_error: null })
            .eq("id", triggerRow.id);

          if (deliverErr) {
            await admin
              .from("user_price_alert_triggers")
              .update({
                delivery_status: "failed",
                delivery_error: deliverErr.message,
              })
              .eq("id", triggerRow.id);
          }
        }
      }

      await admin.from("user_price_alerts").update(patch).eq("id", row.id).eq("user_id", userId);
    }

    return new Response(JSON.stringify({ ok: true, evaluated, triggered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[evaluate-user-price-alerts]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
