// Watchlist V2 Analyzer — greenfield, scoreless, deterministic.
// Auth: mutually exclusive trigger mode (SYNC_SECRET) OR manual JWT mode.
// Ordering: authN → validate body → verify ownership → validate run_id → resolve session → INSERT request row → fetch → compute → AI → finalize.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
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
import { emitMarketSignals, TRANSITION_ALERT_SIGNAL_IDS } from "../_shared/watchlist-v2/signals.ts";
import { mapNewsEvents } from "../_shared/watchlist-v2/events.ts";
import { evaluateSufficiency } from "../_shared/watchlist-v2/sufficiency.ts";
import { buildAiPrompt, makeAnthropicCaller, type AiCaller } from "../_shared/watchlist-v2/ai-read.ts";

export type ServiceClient = SupabaseClient<any, any, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ErrorCode =
  | "RATE_LIMITED" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR"
  | "AI_VALIDATION_FAILED" | "UPSTREAM_ERROR" | "UNKNOWN";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

export type Mode = "trigger" | "manual" | "ambiguous" | "none";

export function selectMode(body: unknown): Mode {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "none";
  const b = body as Record<string, unknown>;
  const hasRecord = b.record !== undefined && b.record !== null && typeof b.record === "object" && !Array.isArray(b.record);
  const hasTopTicker = typeof b.ticker === "string";
  if (hasRecord && hasTopTicker) return "ambiguous";
  if (hasRecord) return "trigger";
  if (hasTopTicker) return "manual";
  return "none";
}

export type TriggerParse =
  | { ok: true; ticker: string; owner: string }
  | { ok: false; error: string };

export function parseTriggerBody(body: unknown): TriggerParse {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const rec = (body as Record<string, unknown>).record;
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return { ok: false, error: "invalid_record" };
  const r = rec as Record<string, unknown>;
  const ticker = normalizeTicker(r.symbol);
  if (!ticker) return { ok: false, error: "invalid_ticker" };
  const owner = typeof r.user_id === "string" ? r.user_id.trim() : "";
  if (!UUID_RE.test(owner)) return { ok: false, error: "invalid_user_id" };
  return { ok: true, ticker, owner };
}

export type ManualParse =
  | { ok: true; ticker: string }
  | { ok: false; error: string };

export function parseManualBody(body: unknown): ManualParse {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const ticker = normalizeTicker((body as Record<string, unknown>).ticker);
  if (!ticker) return { ok: false, error: "invalid_ticker" };
  return { ok: true, ticker };
}

export function extractRunId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const v = b.run_id;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return UUID_RE.test(t) ? t : null;
}

// ── Request handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Step 1: extract token (never log)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse(401, { error: "unauthorized" });
  const token = authHeader.slice(7).trim();
  if (!token) return jsonResponse(401, { error: "unauthorized" });

  // Step 2: parse body
  let bodyRaw = "";
  try { bodyRaw = await req.text(); } catch { /* noop */ }
  let body: unknown = {};
  try { body = bodyRaw ? JSON.parse(bodyRaw) : {}; }
  catch { return jsonResponse(400, { error: "invalid_json" }); }

  const mode = selectMode(body);
  if (mode === "ambiguous") return jsonResponse(400, { error: "ambiguous_mode" });
  if (mode === "none") return jsonResponse(400, { error: "missing_mode" });

  let ticker: string;
  let owner: string;
  let source: "trigger" | "manual";

  if (mode === "trigger") {
    const syncSecret = Deno.env.get("SYNC_SECRET");
    if (!(await timingSafeMatch(token, syncSecret))) return jsonResponse(401, { error: "unauthorized" });
    const p = parseTriggerBody(body);
    if (!p.ok) return jsonResponse(400, { error: p.error });
    ticker = p.ticker; owner = p.owner; source = "trigger";
  } else {
    // manual JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    let uid: string | null = null;
    try {
      const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const j = await r.json().catch(() => null) as { id?: unknown } | null;
        if (j && typeof j.id === "string" && UUID_RE.test(j.id)) uid = j.id;
      } else {
        await r.text().catch(() => "");
      }
    } catch { /* fall through */ }
    if (!uid) return jsonResponse(401, { error: "unauthorized" });
    const p = parseManualBody(body);
    if (!p.ok) return jsonResponse(400, { error: p.error });
    ticker = p.ticker; owner = uid; source = "manual";
  }

  const runId = extractRunId(body);

  // Service client
  const supabase: ServiceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  ) as unknown as ServiceClient;

  // Step 3: ownership verification
  {
    const { data: owned, error: ownErr } = await supabase
      .from("watchlists")
      .select("id")
      .eq("user_id", owner)
      .eq("symbol", ticker)
      .limit(1);
    if (ownErr) {
      console.error(`${LOG_PREFIX} ownership check failed`);
      return jsonResponse(500, { status: "failed", error_code: "UPSTREAM_ERROR" });
    }
    if (!owned || owned.length === 0) {
      return jsonResponse(403, { error: "not_permitted" });
    }
  }

  // Step 4: validate run_id if provided
  if (runId !== null) {
    const { data: runRow, error: runErr } = await supabase
      .from("watchlist_analysis_runs")
      .select("run_id, status")
      .eq("run_id", runId)
      .maybeSingle();
    if (runErr) return jsonResponse(500, { status: "failed", error_code: "UPSTREAM_ERROR" });
    if (!runRow || (runRow as { status?: string }).status !== "running") {
      return jsonResponse(409, { status: "failed", error_code: "UNKNOWN", reason: "invalid_run_id" });
    }
  }

  // Step 5: resolve session (before any request row)
  const analyzedAt = new Date();
  const analyzedAtIso = analyzedAt.toISOString();
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
    if (session.reason === "NON_TRADING_DAY") {
      return jsonResponse(422, { status: "not_applicable", reason: "NON_TRADING_DAY" });
    }
    if (session.reason === "OUTSIDE_SESSION_WINDOW") {
      return jsonResponse(422, { status: "not_applicable", reason: "OUTSIDE_SESSION_WINDOW" });
    }
    return jsonResponse(503, { status: "unresolved", reason: "SESSION_UNRESOLVED" });
  }
  const sessionDate = session.session_date;
  const sessionType = session.session_type;

  // Step 6: create request row (FIRST database write)
  const insertRes = await supabase
    .from("watchlist_analysis_requests")
    .insert({ user_id: owner, ticker, source, status: "pending" })
    .select("id")
    .single();
  if (insertRes.error || !insertRes.data) {
    console.error(`${LOG_PREFIX} request insert failed`);
    return jsonResponse(500, { status: "failed", error_code: "UPSTREAM_ERROR" });
  }
  const requestId = (insertRes.data as { id: string }).id;

  // Step 7: fetch providers
  const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${polygonKey}`;
  const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${sessionDate}/${sessionDate}?adjusted=true&sort=asc&limit=5000&apiKey=${polygonKey}`;
  const newsFrom = new Date(analyzedAt.getTime() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const newsTo = analyzedAt.toISOString().slice(0, 10);
  const newsUrl = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${newsFrom}&to=${newsTo}&token=${finnhubKey}`;

  const [snapshotR, barsR, newsR] = await Promise.all([
    fetchWithOutcome(snapshotUrl, 8000),
    fetchWithOutcome(barsUrl, 8000),
    fetchWithOutcome(newsUrl, 8000),
  ]);

  // Hard-fail on required-provider issues
  if (snapshotR.kind === "transport_failure") {
    return await failAndRespond(supabase, requestId, mapTransportErr(snapshotR.code));
  }
  if (barsR.kind === "transport_failure") {
    return await failAndRespond(supabase, requestId, mapTransportErr(barsR.code));
  }

  // Parse
  const snapshot = assessSnapshot(snapshotR.body, analyzedAt);
  const barsBody = barsR.body as { results?: unknown };
  const barsNorm = normalizeBars(barsBody?.results, sessionDate, analyzedAt);
  const bars = barsNorm.bars;

  const priorClose = snapshot.priorClose;
  const keyLevels = computeKeyLevels(bars, sessionType, priorClose);
  const transitionLevels = computeTransitionLevels(bars, sessionType);
  const basis = computeBasis(bars, snapshot);

  // RVOL baseline
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

  // Signals + events
  const marketSignals: MarketSignal[] = emitMarketSignals({
    bars, keyLevels, transitionLevels,
    price: basis.price, rvol: rvolRes.rvol, rvolClass: rvolRes.rvol_class,
    sessionType, analyzedAt: analyzedAtIso,
  });
  const eventsResult = newsR.kind === "ok"
    ? await mapNewsEvents(newsR.body, analyzedAt, analyzedAtIso, ticker)
    : { events: [] as RecentEvent[], quality: "missing" as const };
  const recentEvents: RecentEvent[] = eventsResult.events;

  // Inputs quality
  const reasonCodes: string[] = [];
  const barsQuality: InputsQuality["bars"] =
    bars.length === 0 ? "missing"
      : bars.length < 3 ? "insufficient"
        : barsNorm.rejected_count > bars.length ? "malformed" : "ok";
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

  const sufficiency = evaluateSufficiency(inputsQuality);

  let direction: AnalysisV2Payload["direction"];
  let explanation: string;
  let driverIds: string[] = [];
  let failureReason: string | null = null;

  if (!sufficiency.ok) {
    direction = "data_unavailable";
    explanation = sufficiency.failure_reason ?? "Data unavailable.";
    failureReason = sufficiency.failure_reason ?? "Data unavailable.";
  } else if (!anthropicKey) {
    return await failAndRespond(supabase, requestId, "UPSTREAM_ERROR");
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
      const allowed = new Set<string>([
        ...marketSignals.map((s) => s.signal_id),
        ...recentEvents.map((e) => e.event_id),
      ]);
      driverIds = outcome.value.driver_ids.filter((id) => allowed.has(id));
    } else if (outcome.kind === "transport_failure") {
      return await failAndRespond(
        supabase, requestId,
        outcome.code === "RATE_LIMITED" ? "RATE_LIMITED"
          : outcome.code === "PROVIDER_TIMEOUT" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR",
      );
    } else {
      return await failAndRespond(supabase, requestId, "AI_VALIDATION_FAILED");
    }
  }

  // Build payload
  const validThrough = new Date(analyzedAt.getTime() + 5 * 60 * 1000).toISOString();
  const payload: AnalysisV2Payload = {
    ticker, contract_version: CONTRACT_VERSION,
    session_date: sessionDate, session_type: sessionType, valid_through: validThrough,
    direction, explanation, driver_ids: driverIds, failure_reason: failureReason,
    price: basis.price, change_pct: basis.change_pct,
    intraday: bars,
    volume: basis.volume !== null ? Math.round(basis.volume) : null,
    rvol: rvolRes.rvol, rvol_class: rvolRes.rvol_class,
    market_signals: marketSignals, recent_events: recentEvents,
    key_levels: keyLevels, inputs_quality: inputsQuality,
    analyzed_at: analyzedAtIso, run_id: runId,
  };

  const forbidden = containsForbiddenKey(payload);
  if (forbidden) {
    console.error(`${LOG_PREFIX} forbidden key blocked: ${sanitize(forbidden)}`);
    return await failAndRespond(supabase, requestId, "UPSTREAM_ERROR");
  }
  const validated = validateAnalysisV2Payload(payload);
  if (!validated.ok) {
    console.error(`${LOG_PREFIX} payload validation failed`);
    return await failAndRespond(supabase, requestId, "UNKNOWN");
  }

  // Alerts (transition signals only + unusual_volume + company_event)
  const alerts: AlertCandidate[] = buildAlerts({
    ticker, sessionDate, sessionType, analyzedAtIso,
    marketSignals, recentEvents,
    rvol: rvolRes.rvol, rvolClass: rvolRes.rvol_class,
  });

  // Finalize
  let rpcResp: { data: unknown; error: { message: string } | null };
  try {
    rpcResp = await supabase.rpc("finalize_watchlist_analysis_v2", {
      p_request_id: requestId, p_user_id: owner, p_ticker: ticker,
      p_payload: payload, p_alerts: alerts, p_run_id: runId,
    });
  } catch {
    // Uncertain network outcome — reread
    return await rereadRequest(supabase, requestId);
  }
  if (rpcResp.error) {
    console.error(`${LOG_PREFIX} finalize rpc failed`);
    return await failAndRespond(supabase, requestId, "UPSTREAM_ERROR");
  }

  const rpcData = (rpcResp.data ?? {}) as { status?: string; alerts_created?: number };
  const replayed = rpcData.status === "already_finalized";
  const alertsCreated = typeof rpcData.alerts_created === "number" ? rpcData.alerts_created : 0;

  const respBody: Record<string, unknown> = {
    status: "succeeded", request_id: requestId, ticker, direction,
    session_type: sessionType, session_date: sessionDate,
    alerts_created: alertsCreated, replayed,
  };
  if (direction === "data_unavailable") respBody.failure_reason = failureReason;
  return jsonResponse(200, respBody);
});

function mapTransportErr(code: string): ErrorCode {
  if (code === "RATE_LIMITED") return "RATE_LIMITED";
  if (code === "PROVIDER_TIMEOUT") return "PROVIDER_TIMEOUT";
  return "PROVIDER_ERROR";
}

interface AlertBuildInput {
  ticker: string;
  sessionDate: string;
  sessionType: string;
  analyzedAtIso: string;
  marketSignals: MarketSignal[];
  recentEvents: RecentEvent[];
  rvol: number | null;
  rvolClass: string | null;
}

function buildAlerts(input: AlertBuildInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const { ticker, sessionDate, sessionType, analyzedAtIso, marketSignals, recentEvents, rvol, rvolClass } = input;
  for (const s of marketSignals) {
    if (s.kind !== "transition") continue;
    if (!TRANSITION_ALERT_SIGNAL_IDS.has(s.signal_id)) continue;
    out.push({
      ticker, alert_type: "market_signal", reason: s.label,
      facts: { signal_id: s.signal_id, ...s.facts },
      event_time: s.observed_at, session_date: sessionDate,
      dedupe_key: `${ticker}|${sessionDate}|${s.signal_id}`,
    });
  }
  if (rvolClass === "unusual" && rvol !== null) {
    out.push({
      ticker, alert_type: "unusual_volume",
      reason: `Unusual volume: ${rvol}x baseline`,
      facts: { rvol, session_type: sessionType },
      event_time: analyzedAtIso, session_date: sessionDate,
      dedupe_key: `${ticker}|${sessionDate}|unusual_volume`,
    });
  }
  for (const e of recentEvents) {
    out.push({
      ticker, alert_type: "company_event", reason: e.title,
      facts: { source: e.source_name, event_id: e.event_id },
      event_time: e.event_time, session_date: sessionDate,
      dedupe_key: `${ticker}|company_event|${e.event_id}`,
    });
  }
  return out;
}

async function failAndRespond(
  supabase: ServiceClient, requestId: string, code: ErrorCode,
): Promise<Response> {
  const { error } = await supabase.rpc("fail_watchlist_analysis_v2", {
    p_request_id: requestId, p_user_id: null, p_error_code: code,
  });
  if (error) console.error(`${LOG_PREFIX} fail rpc error`);
  return jsonResponse(200, { status: "failed", request_id: requestId, error_code: code });
}

async function rereadRequest(supabase: ServiceClient, requestId: string): Promise<Response> {
  for (let i = 0; i < 2; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const { data, error } = await supabase
      .from("watchlist_analysis_requests")
      .select("status, error_code")
      .eq("id", requestId)
      .maybeSingle();
    if (error) continue;
    const st = (data as { status?: string } | null)?.status;
    if (st === "succeeded") {
      return jsonResponse(200, { status: "succeeded", request_id: requestId, replayed: true });
    }
    if (st === "failed") {
      const code = (data as { error_code?: string }).error_code ?? "UNKNOWN";
      return jsonResponse(200, { status: "failed", request_id: requestId, error_code: code });
    }
  }
  return jsonResponse(202, { status: "unresolved", request_id: requestId });
}
