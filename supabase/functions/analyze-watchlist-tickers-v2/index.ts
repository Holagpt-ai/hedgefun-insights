// Watchlist V2 Analyzer — greenfield, scoreless, deterministic.
// SYNC_SECRET-only auth. Per-ticker lifecycle:
//   ensure request row → resolve session → fetch → compute → sufficiency gate →
//   (AI read or data_unavailable) → build alert candidates → finalize RPC.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeMatch } from "../_shared/timing-safe.ts";

import { LOG_PREFIX, sanitize } from "../_shared/watchlist-v2/sanitize.ts";
import {
  containsForbiddenKey, CONTRACT_VERSION, normalizeTicker,
  validateAnalysisV2Payload,
  type AlertCandidate, type AnalysisV2Payload, type InputsQuality,
  type MarketSignal, type RecentEvent,
} from "../_shared/watchlist-v2/contract.ts";
import { resolveSession, type MarketStatusFetcher } from "../_shared/watchlist-v2/session.ts";
import {
  assessSnapshot, computeBasis, fetchWithOutcome, normalizeBars,
} from "../_shared/watchlist-v2/market-data.ts";
import { computeKeyLevels, computeTransitionLevels } from "../_shared/watchlist-v2/levels.ts";
import { computeRvol, type Baseline } from "../_shared/watchlist-v2/rvol.ts";
import { emitMarketSignals } from "../_shared/watchlist-v2/signals.ts";
import { mapNewsEvents } from "../_shared/watchlist-v2/events.ts";
import { evaluateSufficiency } from "../_shared/watchlist-v2/sufficiency.ts";
import { buildAiPrompt, makeAnthropicCaller, type AiCaller } from "../_shared/watchlist-v2/ai-read.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ErrorCode =
  | "RATE_LIMITED" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR"
  | "AI_VALIDATION_FAILED" | "UPSTREAM_ERROR" | "UNKNOWN";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (!(await timingSafeMatch(token, syncSecret))) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  // ── Body ────────────────────────────────────────────────────────────────
  let bodyRaw = "";
  try { bodyRaw = await req.text(); } catch { /* noop */ }
  let body: Record<string, unknown> = {};
  try { body = bodyRaw ? JSON.parse(bodyRaw) : {}; } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const ticker = normalizeTicker(body.ticker);
  if (!ticker) return jsonResponse(400, { error: "ticker required" });
  const explicitRequestId = typeof body.request_id === "string" ? body.request_id : null;
  const runId = typeof body.run_id === "string" ? body.run_id : null;
  const userIdHint = typeof body.user_id === "string" ? body.user_id : null;

  // ── Service client ──────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Ensure request row ──────────────────────────────────────────────────
  let requestId = explicitRequestId;
  if (!requestId) {
    if (!userIdHint) {
      return jsonResponse(400, { error: "request_id or user_id required" });
    }
    const { data, error } = await supabase
      .from("watchlist_analysis_requests")
      .insert({ user_id: userIdHint, ticker, source: "manual", status: "pending" })
      .select("id")
      .single();
    if (error || !data) {
      console.error(`${LOG_PREFIX} request insert failed:`, sanitize(error?.message));
      return jsonResponse(500, { error: "request_create_failed" });
    }
    requestId = data.id as string;
  }

  const analyzedAt = new Date();
  const analyzedAtIso = analyzedAt.toISOString();

  // ── 1. Session ──────────────────────────────────────────────────────────
  const polygonKey = Deno.env.get("POLYGON_API_KEY") ?? "";
  const finnhubKey = Deno.env.get("FINNHUB_API_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  const marketStatus: MarketStatusFetcher = {
    async fetchNow() {
      const r = await fetchWithOutcome(
        `https://api.polygon.io/v1/marketstatus/now?apiKey=${polygonKey}`, 6000);
      if (r.kind !== "ok") throw new Error(r.code);
      return r.body as { serverTime?: string };
    },
    async fetchUpcoming() {
      const r = await fetchWithOutcome(
        `https://api.polygon.io/v1/marketstatus/upcoming?apiKey=${polygonKey}`, 6000);
      if (r.kind !== "ok") throw new Error(r.code);
      return Array.isArray(r.body) ? r.body as [] : [];
    },
  };

  const session = await resolveSession(analyzedAt, marketStatus);
  if (!session.ok) {
    return await failAndRespond(supabase, requestId, runId, "UPSTREAM_ERROR",
      `session_${session.reason.toLowerCase()}`);
  }

  const sessionDate = session.session_date;
  const sessionType = session.session_type;

  // ── 2. Fetch snapshot + bars + news in parallel ─────────────────────────
  const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${polygonKey}`;
  const dateForBars = sessionDate;
  const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${dateForBars}/${dateForBars}?adjusted=true&sort=asc&limit=5000&apiKey=${polygonKey}`;
  const newsFrom = new Date(analyzedAt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const newsTo = analyzedAt.toISOString().slice(0, 10);
  const newsUrl = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${newsFrom}&to=${newsTo}&token=${finnhubKey}`;

  const [snapshotR, barsR, newsR] = await Promise.all([
    fetchWithOutcome(snapshotUrl, 8000),
    fetchWithOutcome(barsUrl, 8000),
    fetchWithOutcome(newsUrl, 8000),
  ]);

  // Hard-fail on required-provider transport errors (rate limit / persistent).
  if (snapshotR.kind === "transport_failure" && snapshotR.code === "RATE_LIMITED") {
    return await failAndRespond(supabase, requestId, runId, "RATE_LIMITED", "snapshot_rate_limited");
  }
  if (barsR.kind === "transport_failure" && barsR.code === "RATE_LIMITED") {
    return await failAndRespond(supabase, requestId, runId, "RATE_LIMITED", "bars_rate_limited");
  }

  // ── 3. Parse ────────────────────────────────────────────────────────────
  const snapshot = snapshotR.kind === "ok"
    ? assessSnapshot(snapshotR.body, analyzedAt)
    : { quality: "missing" as const, lastTradeTs: null, priorClose: null, dayClose: null, dayVolume: null };

  const barsBody = barsR.kind === "ok" ? (barsR.body as { results?: unknown }) : null;
  const barsNorm = barsR.kind === "ok"
    ? normalizeBars(barsBody?.results, sessionDate, analyzedAt)
    : { bars: [], rejected_count: 0 };
  const bars = barsNorm.bars;

  // ── 4. Levels ───────────────────────────────────────────────────────────
  const priorClose = snapshot.priorClose;
  const keyLevels = computeKeyLevels(bars, sessionType, priorClose);
  const transitionLevels = computeTransitionLevels(bars, sessionType);

  // ── 5. Basis ────────────────────────────────────────────────────────────
  const basis = computeBasis(bars, snapshot);

  // ── 6. RVOL baseline ────────────────────────────────────────────────────
  let baseline: Baseline | null = null;
  if (sessionType === "rth") {
    const { data: br } = await supabase
      .from("watchlist_rvol_baseline")
      .select("baseline_date, curve, sessions_used")
      .eq("ticker", ticker)
      .lt("baseline_date", sessionDate)
      .order("baseline_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (br && Array.isArray((br as { curve?: unknown }).curve)) {
      baseline = br as unknown as Baseline;
    }
  }
  const rvolRes = computeRvol(
    sessionType, sessionDate, session.et_now_minutes, basis.volume, baseline,
  );

  // ── 7. Signals + Events ─────────────────────────────────────────────────
  const marketSignals: MarketSignal[] = emitMarketSignals({
    bars, keyLevels, transitionLevels,
    price: basis.price, rvol: rvolRes.rvol, rvolClass: rvolRes.rvol_class,
    sessionType, analyzedAt: analyzedAtIso,
  });
  const eventsResult = newsR.kind === "ok"
    ? mapNewsEvents(newsR.body, analyzedAt, analyzedAtIso)
    : { events: [], quality: "missing" as const };
  const recentEvents: RecentEvent[] = eventsResult.events;

  // ── 8. Inputs quality ───────────────────────────────────────────────────
  const reasonCodes: string[] = [];
  const barsQuality: InputsQuality["bars"] =
    barsR.kind !== "ok" ? "missing"
      : bars.length === 0 ? "missing"
        : bars.length < 3 ? "insufficient"
          : barsNorm.rejected_count > bars.length ? "malformed" : "ok";
  if (barsR.kind === "transport_failure") reasonCodes.push(`bars_${barsR.code.toLowerCase()}`);
  if (snapshotR.kind === "transport_failure") reasonCodes.push(`snapshot_${snapshotR.code.toLowerCase()}`);
  if (newsR.kind === "transport_failure") reasonCodes.push(`news_${newsR.code.toLowerCase()}`);

  const inputsQuality: InputsQuality = {
    snapshot: snapshot.quality,
    bars: barsQuality,
    prior_close: priorClose === null ? "missing" : "ok",
    volume: basis.volume === null ? "missing" : "ok",
    rvol: rvolRes.quality,
    events: eventsResult.quality,
    bar_count: bars.length,
    feed_delay_note: "provider feed is 15-minute delayed",
    reason_codes: reasonCodes,
  };

  // ── 9. Sufficiency ──────────────────────────────────────────────────────
  const sufficiency = evaluateSufficiency(inputsQuality);

  // ── 10. Direction/explanation ───────────────────────────────────────────
  let direction: AnalysisV2Payload["direction"];
  let explanation: string;
  let driverIds: string[] = [];
  let failureReason: string | null = null;

  if (!sufficiency.ok) {
    direction = "data_unavailable";
    explanation = sufficiency.failure_reason ?? "Data unavailable.";
    failureReason = sufficiency.failure_reason ?? "Data unavailable.";
  } else if (!anthropicKey) {
    direction = "neutral";
    explanation = "AI read unavailable; showing deterministic facts only.";
  } else {
    const caller: AiCaller = makeAnthropicCaller(anthropicKey);
    const prompt = buildAiPrompt({
      ticker, session_type: sessionType, session_date: sessionDate,
      price: basis.price, change_pct: basis.change_pct, volume: basis.volume,
      rvol: rvolRes.rvol, rvol_class: rvolRes.rvol_class,
      key_levels: keyLevels, market_signals: marketSignals, recent_events: recentEvents,
      reason_codes: reasonCodes,
    });
    const outcome = await caller.call(prompt);
    if (outcome.kind === "ok") {
      direction = outcome.value.direction;
      explanation = outcome.value.explanation;
      // Validate driver ids
      const allowed = new Set<string>([
        ...marketSignals.map((s) => s.signal_id),
        ...recentEvents.map((e) => e.event_id),
      ]);
      driverIds = outcome.value.driver_ids.filter((id) => allowed.has(id));
    } else if (outcome.kind === "transport_failure") {
      return await failAndRespond(supabase, requestId, runId,
        outcome.code === "RATE_LIMITED" ? "RATE_LIMITED" : "PROVIDER_ERROR",
        `ai_${outcome.code.toLowerCase()}`);
    } else {
      return await failAndRespond(supabase, requestId, runId, "AI_VALIDATION_FAILED",
        `ai_${outcome.reason}`);
    }
  }

  // ── 11. Build payload ───────────────────────────────────────────────────
  const validThrough = new Date(analyzedAt.getTime() + 5 * 60 * 1000).toISOString();
  const payload: AnalysisV2Payload = {
    ticker,
    contract_version: CONTRACT_VERSION,
    session_date: sessionDate,
    session_type: sessionType,
    valid_through: validThrough,
    direction,
    explanation,
    driver_ids: driverIds,
    failure_reason: failureReason,
    price: basis.price,
    change_pct: basis.change_pct,
    intraday: bars,
    volume: basis.volume !== null ? Math.round(basis.volume) : null,
    rvol: rvolRes.rvol,
    rvol_class: rvolRes.rvol_class,
    market_signals: marketSignals,
    recent_events: recentEvents,
    key_levels: keyLevels,
    inputs_quality: inputsQuality,
    analyzed_at: analyzedAtIso,
    run_id: runId,
  };

  const forbidden = containsForbiddenKey(payload);
  if (forbidden) {
    console.error(`${LOG_PREFIX} forbidden key blocked: ${sanitize(forbidden)}`);
    return await failAndRespond(supabase, requestId, runId, "UPSTREAM_ERROR", "forbidden_key");
  }

  const validated = validateAnalysisV2Payload(payload);
  if (!validated.ok) {
    console.error(`${LOG_PREFIX} payload validation failed:`, sanitize(validated.reason));
    return await failAndRespond(supabase, requestId, runId, "UPSTREAM_ERROR", validated.reason);
  }

  // ── 12. Build alert candidates ──────────────────────────────────────────
  const alerts: AlertCandidate[] = buildAlerts({
    ticker, sessionDate, sessionType, analyzedAtIso, marketSignals,
    recentEvents, rvol: rvolRes.rvol, rvolClass: rvolRes.rvol_class,
    direction,
  });

  // ── 13. Finalize atomically ─────────────────────────────────────────────
  const { error: rpcErr } = await supabase.rpc("finalize_watchlist_analysis_v2", {
    p_request_id: requestId, p_payload: payload,
    p_alerts: alerts, p_run_id: runId,
  });
  if (rpcErr) {
    console.error(`${LOG_PREFIX} finalize rpc failed:`, sanitize(rpcErr.message));
    return await failAndRespond(supabase, requestId, runId, "UPSTREAM_ERROR", "finalize_rpc_failed");
  }

  return jsonResponse(200, {
    ticker, direction, session_type: sessionType, session_date: sessionDate,
    alerts_written: alerts.length,
  });
});

interface AlertBuildInput {
  ticker: string;
  sessionDate: string;
  sessionType: string;
  analyzedAtIso: string;
  marketSignals: MarketSignal[];
  recentEvents: RecentEvent[];
  rvol: number | null;
  rvolClass: string | null;
  direction: string;
}

function buildAlerts(input: AlertBuildInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const { ticker, sessionDate, sessionType, analyzedAtIso, marketSignals, recentEvents, rvol, rvolClass } = input;

  // Market-signal (transition) alerts
  for (const s of marketSignals) {
    if (s.kind !== "transition") continue;
    out.push({
      ticker,
      alert_type: "market_signal",
      reason: s.label,
      facts: { signal_id: s.signal_id, ...s.facts },
      event_time: s.observed_at,
      session_date: sessionDate,
      dedupe_key: `${ticker}|${sessionDate}|${s.signal_id}`,
    });
  }

  // Unusual volume alert
  if (rvolClass === "unusual" && rvol !== null) {
    out.push({
      ticker,
      alert_type: "unusual_volume",
      reason: `Unusual volume: ${rvol}x baseline`,
      facts: { rvol, session_type: sessionType },
      event_time: analyzedAtIso,
      session_date: sessionDate,
      dedupe_key: `${ticker}|${sessionDate}|unusual_volume`,
    });
  }

  // Company event alerts (dedupe per event id)
  for (const e of recentEvents) {
    out.push({
      ticker,
      alert_type: "company_event",
      reason: e.title,
      facts: { source: e.source_name, event_id: e.event_id },
      event_time: e.event_time,
      session_date: sessionDate,
      dedupe_key: `${ticker}|company_event|${e.event_id}`,
    });
  }

  return out;
}

async function failAndRespond(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  runId: string | null,
  code: ErrorCode,
  reason: string,
): Promise<Response> {
  const { error } = await supabase.rpc("fail_watchlist_analysis_v2", {
    p_request_id: requestId, p_error_code: code, p_run_id: runId,
  });
  if (error) {
    console.error(`${LOG_PREFIX} fail rpc error:`, sanitize(error.message));
  }
  return jsonResponse(200, { ticker_result: "failed", error_code: code, reason });
}
