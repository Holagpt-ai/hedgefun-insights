// Watchlist V2 Analyzer — greenfield, scoreless, deterministic.
// Auth: mutually exclusive trigger mode (SYNC_SECRET) OR manual JWT mode.
// Ordering: authN → validate body → verify ownership → validate run_id → resolve session
// → INSERT request row → still_valid gate → fetch → sufficiency → material-change
// → ticker lease → AI → finalize. Scheduled/trigger cannot force-refresh.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeMatch } from "../_shared/timing-safe.ts";

import { LOG_PREFIX, sanitize } from "../_shared/watchlist-v2/sanitize.ts";
import {
  containsForbiddenKey, CONTRACT_VERSION, normalizeTicker,
  validateAnalysisV2Payload,
  type AlertCandidate, type AnalysisV2Payload, type Direction, type InputsQuality,
  type MarketSignal, type RecentEvent, type SessionType,
} from "../_shared/watchlist-v2/contract.ts";
import { resolveSession, type MarketStatusFetcher } from "../_shared/watchlist-v2/session.ts";
import {
  assessSnapshot, computeBasis, fetchWithOutcome, normalizeBars, STALE_MS,
  type ProviderFailureKind, type ProviderTransportFailure,
} from "../_shared/watchlist-v2/market-data.ts";
import { computeKeyLevels, computeTransitionLevels } from "../_shared/watchlist-v2/levels.ts";
import { computeRvol, type Baseline } from "../_shared/watchlist-v2/rvol.ts";
import { emitMarketSignals, TRANSITION_ALERT_SIGNAL_IDS } from "../_shared/watchlist-v2/signals.ts";
import { mapNewsEvents } from "../_shared/watchlist-v2/events.ts";
import {
  evaluateSufficiency, MIN_BARS_FOR_AI, type SufficiencyCode,
} from "../_shared/watchlist-v2/sufficiency.ts";
import {
  buildAiPrompt, buildEvidenceCatalog,
} from "../_shared/watchlist-v2/ai-read.ts";
import {
  createWatchlistAiAdapter,
  emitWatchlistAiCallLog,
  generateWatchlistAnalysis,
  resolveWatchlistAiConfig,
  type WatchlistAiCallMeta,
} from "../_shared/watchlist-v2/ai-provider.ts";
import {
  computeValidThrough,
  decideAfterFacts,
  decideBeforeFetch,
  parsePriorAnalysis,
  resolveForceRefresh,
  type MaterialFacts,
  type PriorAnalysis,
} from "../_shared/watchlist-v2/cost-control.ts";
import {
  TICKER_LEASE_SECONDS,
  createRpcTickerLeaseStore,
  runExclusiveClaudeCall,
} from "../_shared/watchlist-v2/ticker-lease.ts";
import {
  attributeSymbol,
} from "../_shared/catalyst/attribution.ts";
import {
  buildAiEvidence,
  isInsufficientEvidence,
} from "../_shared/ai/evidence.ts";
import {
  emitAnalyzerOutcomeLog,
  emptyAnalyzerOutcomeLog,
  resolveAnalyzerOrigin,
  type AnalyzerOutcomeLog,
} from "./outcome-log.ts";

export type ServiceClient = SupabaseClient;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Company-event alert cutoff
const EVENT_ALERT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
// Earnings horizon
const EARNINGS_HORIZON_DAYS = 3;

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
  | { ok: true; ticker: string; force_refresh: boolean }
  | { ok: false; error: string };

export function parseManualBody(body: unknown): ManualParse {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const ticker = normalizeTicker((body as Record<string, unknown>).ticker);
  if (!ticker) return { ok: false, error: "invalid_ticker" };
  return { ok: true, ticker, force_refresh: resolveForceRefresh("manual", body) };
}

export type RunIdParse =
  | { kind: "absent" }
  | { kind: "valid"; value: string }
  | { kind: "malformed" };

/** Discriminates absent, valid uuid, and malformed supplied run_id. */
export function parseRunId(body: unknown): RunIdParse {
  if (!body || typeof body !== "object") return { kind: "absent" };
  const b = body as Record<string, unknown>;
  if (!("run_id" in b)) return { kind: "absent" };
  const v = b.run_id;
  if (v === null || v === undefined) return { kind: "absent" };
  if (typeof v !== "string") return { kind: "malformed" };
  const t = v.trim();
  if (t.length === 0) return { kind: "absent" };
  if (!UUID_RE.test(t)) return { kind: "malformed" };
  return { kind: "valid", value: t };
}

// ── Alert builder (pure) ──────────────────────────────────────────────────

export interface AlertBuildInput {
  ticker: string;
  sessionDate: string;
  sessionType: SessionType;
  analyzedAtIso: string;
  analyzedAtMs: number;
  marketSignals: MarketSignal[];
  recentEvents: RecentEvent[];
  rvol: number | null;
  rvolClass: string | null;
  direction: Direction;
  priorDirection: Direction | null;
  earningsDate: string | null; // YYYY-MM-DD or null
}

/** Deterministic alert candidate builder. Never emits key_level. */
export function buildAlerts(input: AlertBuildInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const {
    ticker, sessionDate, sessionType, analyzedAtIso, analyzedAtMs,
    marketSignals, recentEvents, rvol, rvolClass,
    direction, priorDirection, earningsDate,
  } = input;

  // direction_change
  if (priorDirection && priorDirection !== "data_unavailable"
      && direction !== "data_unavailable" && priorDirection !== direction) {
    out.push({
      ticker, alert_type: "direction_change",
      reason: `Direction changed from ${priorDirection} to ${direction}`,
      facts: { from: priorDirection, to: direction, session_type: sessionType },
      event_time: analyzedAtIso, session_date: sessionDate,
      dedupe_key: `v2:direction_change:${ticker}:${sessionDate}:${priorDirection}->${direction}`,
    });
  }

  // unusual_volume
  if (rvolClass === "unusual" && rvol !== null) {
    out.push({
      ticker, alert_type: "unusual_volume",
      reason: `Unusual volume: ${rvol}x baseline`,
      facts: { rvol, session_type: sessionType },
      event_time: analyzedAtIso, session_date: sessionDate,
      dedupe_key: `v2:unusual_volume:${ticker}:${sessionDate}`,
    });
  }

  // market_signal (transitions from approved set only)
  for (const s of marketSignals) {
    if (s.kind !== "transition") continue;
    if (!TRANSITION_ALERT_SIGNAL_IDS.has(s.signal_id)) continue;
    out.push({
      ticker, alert_type: "market_signal", reason: s.label,
      facts: { signal_id: s.signal_id, ...s.facts },
      event_time: s.observed_at, session_date: sessionDate,
      dedupe_key: `v2:market_signal:${ticker}:${sessionDate}:${s.signal_id}`,
    });
  }

  // company_event (only within last 6 hours)
  for (const e of recentEvents) {
    const evMs = Date.parse(e.event_time);
    if (!Number.isFinite(evMs)) continue;
    if (analyzedAtMs - evMs > EVENT_ALERT_MAX_AGE_MS) continue;
    out.push({
      ticker, alert_type: "company_event", reason: e.title,
      facts: { source: e.source_name, event_id: e.event_id },
      event_time: e.event_time, session_date: sessionDate,
      dedupe_key: `v2:company_event:${ticker}:${sessionDate}:${e.event_id}`,
    });
  }

  // earnings_upcoming
  if (earningsDate) {
    const et = Date.parse(`${earningsDate}T00:00:00Z`);
    const st = Date.parse(`${sessionDate}T00:00:00Z`);
    if (Number.isFinite(et) && Number.isFinite(st)) {
      const days = Math.round((et - st) / (24 * 3600 * 1000));
      if (days >= 0 && days <= EARNINGS_HORIZON_DAYS) {
        out.push({
          ticker, alert_type: "earnings_upcoming",
          reason: `Earnings in ${days} day(s)`,
          facts: { report_date: earningsDate, days_out: days },
          event_time: analyzedAtIso, session_date: sessionDate,
          dedupe_key: `v2:earnings_upcoming:${ticker}:${sessionDate}:${earningsDate}`,
        });
      }
    }
  }

  return out;
}

// ── Provider stage diagnostics (pure) ─────────────────────────────────────

export type ProviderStage = "polygon_snapshot" | "polygon_bars" | "anthropic_ai" | "watchlist_ai";

/**
 * Sanitized, log-only view of a transport failure. Carries no URL, credential,
 * header, prompt or response body — only the fields below are ever populated.
 */
export interface ProviderFailureDiagnostic {
  ticker: string;
  provider_stage: ProviderStage;
  error_code: ErrorCode;
  http_status: number | null;
  failure_kind: ProviderFailureKind;
}

export function buildProviderFailureDiagnostic(
  ticker: string,
  stage: ProviderStage,
  failure: ProviderTransportFailure,
): ProviderFailureDiagnostic {
  return {
    ticker: normalizeTicker(ticker) ?? "",
    provider_stage: stage,
    error_code: mapTransportErr(failure.code),
    http_status: typeof failure.http_status === "number" ? failure.http_status : null,
    failure_kind: failure.failure_kind,
  };
}

export function formatProviderFailureLog(d: ProviderFailureDiagnostic): string {
  return `${LOG_PREFIX} provider stage failure ${sanitize(JSON.stringify(d))}`;
}

function logProviderFailure(
  ticker: string,
  stage: ProviderStage,
  failure: ProviderTransportFailure,
): ErrorCode {
  const diagnostic = buildProviderFailureDiagnostic(ticker, stage, failure);
  console.error(formatProviderFailureLog(diagnostic));
  return diagnostic.error_code;
}

/**
 * Contract enforcement: when direction=data_unavailable, the persisted payload
 * MUST NOT carry AI-generated drivers or market signals. Pure helper so the
 * invariant can be regression-tested in isolation.
 */
export function sanitizeUnavailableEvidence(input: {
  direction: Direction;
  driverIds: string[];
  marketSignals: MarketSignal[];
}): { driverIds: string[]; marketSignals: MarketSignal[] } {
  if (input.direction === "data_unavailable") {
    return { driverIds: [], marketSignals: [] };
  }
  return { driverIds: input.driverIds, marketSignals: input.marketSignals };
}


// ── Request handler ────────────────────────────────────────────────────────

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

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

  // Validate run_id BEFORE any auth-consuming work
  const runIdParsed = parseRunId(body);
  if (runIdParsed.kind === "malformed") return jsonResponse(400, { error: "invalid_run_id" });
  const runId: string | null = runIdParsed.kind === "valid" ? runIdParsed.value : null;

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

  const forceRefresh = resolveForceRefresh(source, body);

  const startedMs = Date.now();
  const outcomeLog: AnalyzerOutcomeLog = emptyAnalyzerOutcomeLog(
    ticker,
    resolveAnalyzerOrigin(source, runId),
  );
  outcomeLog.stale_threshold_ms = STALE_MS;
  const finish = (resp: Response): Response => {
    outcomeLog.elapsed_ms = Date.now() - startedMs;
    emitAnalyzerOutcomeLog(outcomeLog);
    return resp;
  };

  const supabase: ServiceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  ) as unknown as ServiceClient;

  // Step 3: ownership verification (BEFORE run_id existence check, session resolution, or request row)
  {
    const { data: owned, error: ownErr } = await supabase
      .from("watchlists")
      .select("id")
      .eq("user_id", owner)
      .eq("symbol", ticker)
      .limit(1);
    if (ownErr) {
      console.error(`${LOG_PREFIX} ownership check failed`);
      outcomeLog.outcome = "failed";
      outcomeLog.failure_reason = "UPSTREAM_ERROR";
      return finish(jsonResponse(500, { status: "failed", error_code: "UPSTREAM_ERROR" }));
    }
    if (!owned || owned.length === 0) {
      outcomeLog.outcome = "failed";
      outcomeLog.failure_reason = "UNKNOWN";
      return finish(jsonResponse(403, { error: "not_permitted" }));
    }
  }

  // Step 4: validate run_id existence + running state
  if (runId !== null) {
    const { data: runRow, error: runErr } = await supabase
      .from("watchlist_analysis_runs")
      .select("run_id, status")
      .eq("run_id", runId)
      .maybeSingle();
    if (runErr) {
      outcomeLog.outcome = "failed";
      outcomeLog.failure_reason = "UPSTREAM_ERROR";
      return finish(jsonResponse(500, { status: "failed", error_code: "UPSTREAM_ERROR" }));
    }
    if (!runRow || (runRow as { status?: string }).status !== "running") {
      outcomeLog.outcome = "failed";
      outcomeLog.failure_reason = "UNKNOWN";
      return finish(jsonResponse(409, { status: "failed", error_code: "UNKNOWN", reason: "invalid_run_id" }));
    }
  }

  // Step 5: resolve session (before any request row)
  const analyzedAt = new Date();
  const analyzedAtMs = analyzedAt.getTime();
  const analyzedAtIso = analyzedAt.toISOString();
  const polygonKey = Deno.env.get("POLYGON_API_KEY") ?? "";
  const finnhubKey = Deno.env.get("FINNHUB_API_KEY") ?? "";
  const aiConfig = resolveWatchlistAiConfig({
    WATCHLIST_AI_PROVIDER: Deno.env.get("WATCHLIST_AI_PROVIDER"),
    WATCHLIST_AI_MODEL: Deno.env.get("WATCHLIST_AI_MODEL"),
    WATCHLIST_AI_FALLBACK: Deno.env.get("WATCHLIST_AI_FALLBACK"),
    ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY"),
  });

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
      outcomeLog.outcome = "not_applicable";
      outcomeLog.failure_reason = "NON_TRADING_DAY";
      return finish(jsonResponse(422, { status: "not_applicable", reason: "NON_TRADING_DAY" }));
    }
    if (session.reason === "OUTSIDE_SESSION_WINDOW") {
      outcomeLog.outcome = "not_applicable";
      outcomeLog.failure_reason = "OUTSIDE_SESSION_WINDOW";
      return finish(jsonResponse(422, { status: "not_applicable", reason: "OUTSIDE_SESSION_WINDOW" }));
    }
    outcomeLog.outcome = "unresolved";
    outcomeLog.failure_reason = "SESSION_UNRESOLVED";
    return finish(jsonResponse(503, { status: "unresolved", reason: "SESSION_UNRESOLVED" }));
  }
  const sessionDate = session.session_date;
  const sessionType = session.session_type;
  outcomeLog.session = sessionType;

  // Step 6: create request row (FIRST database write)
  const insertRes = await supabase
    .from("watchlist_analysis_requests")
    .insert({ user_id: owner, ticker, source, status: "pending" })
    .select("id")
    .single();
  if (insertRes.error || !insertRes.data) {
    console.error(`${LOG_PREFIX} request insert failed`);
    outcomeLog.outcome = "failed";
    outcomeLog.failure_reason = "UPSTREAM_ERROR";
    return finish(jsonResponse(500, { status: "failed", error_code: "UPSTREAM_ERROR" }));
  }
  const requestId = (insertRes.data as { id: string }).id;

  let prior: PriorAnalysis | null = null;
  {
    const { data: prevRow } = await supabase
      .from("watchlist_analysis_v2")
      .select(
        "ticker, session_date, session_type, valid_through, direction, explanation, failure_reason, change_pct, volume, rvol_class, market_signals, recent_events, inputs_quality",
      )
      .eq("ticker", ticker)
      .maybeSingle();
    prior = parsePriorAnalysis(prevRow);
  }

  const preFetch = decideBeforeFetch({
    forceRefresh, prior, now: analyzedAt, sessionDate, sessionType,
  });
  if (preFetch === "skipped_still_valid" && prior) {
    outcomeLog.claude_decision = "skipped_still_valid";
    outcomeLog.outcome = "succeeded";
    const skipped = await completeSkip(supabase, {
      requestId, owner, ticker, runId,
      decision: "skipped_still_valid",
      extendValidThrough: null,
    });
    if (!skipped.ok) {
      outcomeLog.outcome = "failed";
      outcomeLog.failure_reason = "UPSTREAM_ERROR";
      outcomeLog.claude_decision = "error";
      return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
    }
    return finish(jsonResponse(200, {
      status: "succeeded",
      request_id: requestId,
      ticker,
      direction: prior.direction,
      session_type: sessionType,
      session_date: sessionDate,
      alerts_created: 0,
      replayed: false,
      claude_decision: "skipped_still_valid",
    }));
  }

  // Step 7: fetch providers
  const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${polygonKey}`;
  const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${sessionDate}/${sessionDate}?adjusted=true&sort=asc&limit=5000&apiKey=${polygonKey}`;
  const newsFrom = new Date(analyzedAtMs - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const newsTo = analyzedAtIso.slice(0, 10);
  const newsUrl = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${newsFrom}&to=${newsTo}&token=${finnhubKey}`;

  const [snapshotR, barsR, newsR, stockNameRes] = await Promise.all([
    fetchWithOutcome(snapshotUrl, 8000),
    fetchWithOutcome(barsUrl, 8000),
    fetchWithOutcome(newsUrl, 8000),
    supabase.from("stocks").select("name").eq("symbol", ticker).maybeSingle(),
  ]);
  const stockNameRaw = (stockNameRes.data as { name?: unknown } | null)?.name;
  const companyName =
    typeof stockNameRaw === "string" && stockNameRaw.trim() ? stockNameRaw.trim() : null;

  if (snapshotR.kind === "transport_failure") {
    const code = logProviderFailure(ticker, "polygon_snapshot", snapshotR);
    outcomeLog.outcome = "failed";
    outcomeLog.failure_reason = code;
    outcomeLog.provider_stage = "polygon_snapshot";
    outcomeLog.claude_decision = "error";
    return finish(await failAndRespond(supabase, requestId, owner, runId, code));
  }
  if (barsR.kind === "transport_failure") {
    const code = logProviderFailure(ticker, "polygon_bars", barsR);
    outcomeLog.outcome = "failed";
    outcomeLog.failure_reason = code;
    outcomeLog.provider_stage = "polygon_bars";
    outcomeLog.claude_decision = "error";
    return finish(await failAndRespond(supabase, requestId, owner, runId, code));
  }

  const snapshot = assessSnapshot(snapshotR.body, analyzedAt);
  const barsBody = barsR.body as { results?: unknown; resultsCount?: unknown };
  const rawBarsCount = Array.isArray(barsBody?.results) ? (barsBody.results as unknown[]).length : 0;
  const barsNorm = normalizeBars(barsBody?.results, sessionDate, analyzedAt);
  const bars = barsNorm.bars;

  outcomeLog.snapshot_timestamp_source = snapshot.timestampSource;
  outcomeLog.snapshot_age_ms = snapshot.lastTradeTs !== null
    ? Math.max(0, analyzedAtMs - snapshot.lastTradeTs)
    : null;
  outcomeLog.bar_count = bars.length;

  const priorClose = snapshot.priorClose;
  const keyLevels = computeKeyLevels(bars, sessionType, priorClose);
  const transitionLevels = computeTransitionLevels(bars, sessionType);
  const basis = computeBasis(bars, snapshot, ticker);

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
  outcomeLog.rvol_available = rvolRes.rvol !== null;

  const quoteValid = basis.quote?.valid === true && basis.price !== null;

  // Signals + events
  const marketSignals: MarketSignal[] = emitMarketSignals({
    bars, keyLevels, transitionLevels,
    price: basis.price, rvol: rvolRes.rvol, rvolClass: rvolRes.rvol_class,
    sessionType, analyzedAt: analyzedAtIso,
  });
  const eventsResult = newsR.kind === "ok"
    ? await mapNewsEvents(newsR.body, analyzedAt, analyzedAtIso, ticker, companyName)
    : { events: [] as RecentEvent[], quality: "missing" as const };
  const recentEvents: RecentEvent[] = eventsResult.events.filter((e) => {
    const attr = attributeSymbol({
      title: e.title,
      symbol: ticker,
      companyName,
      providerTickers: [ticker],
      providerAssociatesSymbol: true,
    });
    return attr.ticker_specific;
  });
  outcomeLog.signal_count = marketSignals.length;
  outcomeLog.catalyst_present = recentEvents.length > 0;

  // Bars quality: distinguish malformed (raw provided, all rejected) from missing
  let barsQuality: InputsQuality["bars"];
  if (bars.length === 0 && rawBarsCount > 0 && barsNorm.rejected_count > 0) barsQuality = "malformed";
  else if (bars.length === 0) barsQuality = "missing";
  else if (bars.length < MIN_BARS_FOR_AI) barsQuality = "insufficient";
  else barsQuality = "ok";

  const reasonCodes: string[] = [];
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
    snapshot_age_ms: outcomeLog.snapshot_age_ms,
    snapshot_ts_ms: snapshot.lastTradeTs,
    snapshot_timestamp_source: snapshot.timestampSource,
    earnings_date: null,
  };

  const sufficiency = evaluateSufficiency({
    quality: inputsQuality,
    price: basis.price,
    priorClose,
    volume: basis.volume,
    quoteValid,
  });

  const priorDirection: Direction | null = prior?.direction ?? null;

  // Earnings date within horizon (source of truth for earnings_upcoming)
  let earningsDate: string | null = null;
  {
    const horizonDate = new Date(analyzedAtMs + EARNINGS_HORIZON_DAYS * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    const { data: er } = await supabase
      .from("earnings_calendar")
      .select("report_date")
      .eq("symbol", ticker)
      .gte("report_date", sessionDate)
      .lte("report_date", horizonDate)
      .order("report_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const rd = (er as { report_date?: unknown } | null)?.report_date;
    if (typeof rd === "string") earningsDate = rd.slice(0, 10);
  }
  outcomeLog.earnings_present = earningsDate !== null;
  inputsQuality.earnings_date = earningsDate;

  let direction: Direction;
  let explanation: string;
  let driverIds: string[] = [];
  let failureReason: string | null = null;

  const currentFacts: MaterialFacts = {
    change_pct: basis.change_pct,
    volume: basis.volume !== null ? Math.round(basis.volume) : null,
    rvol_class: rvolRes.rvol_class,
    signal_ids: [...new Set(marketSignals.map((s) => s.signal_id))].sort(),
    event_ids: [...new Set(recentEvents.map((e) => e.event_id))].sort(),
    earnings_date: earningsDate,
    session_date: sessionDate,
    session_type: sessionType,
    sufficient: sufficiency.ok,
  };

  if (!sufficiency.ok) {
    const code = sufficiency.failure_code as SufficiencyCode;
    direction = "data_unavailable";
    failureReason = code;
    explanation = sufficiency.explanation ?? "Data unavailable.";
    outcomeLog.outcome = "data_unavailable";
    outcomeLog.failure_reason = code;
    outcomeLog.claude_decision = "skipped_insufficient_data";
  } else {
    const evidence = buildAiEvidence({
      symbol: ticker,
      quote: basis.quote,
      rvol: rvolRes.rvol,
      rvolAvailable: rvolRes.rvol !== null,
      signals: marketSignals.map((s) => ({
        signal_id: s.signal_id,
        label: s.label,
        direction: s.direction,
      })),
      catalysts: recentEvents.map((e) => ({
        title: e.title,
        attribution: "direct" as const,
        ticker_specific: true,
        source_url: e.source_url,
        provider: e.source_name,
        published_at: e.event_time,
        reason: "ticker_specific",
      })),
      earnings: earningsDate
        ? { symbol: ticker, event_date: earningsDate, time_of_day: null, estimate_eps: null, actual_eps: null }
        : null,
      evidenceCutoff: analyzedAtIso,
    });
    if (isInsufficientEvidence(evidence) || !evidence.quote_valid) {
      direction = "data_unavailable";
      failureReason = evidence.quote_valid ? "INSUFFICIENT_EVIDENCE" : "QUOTE_REJECTED";
      explanation = evidence.quote_valid
        ? "Insufficient Data"
        : "Current market snapshot unavailable";
      outcomeLog.outcome = "data_unavailable";
      outcomeLog.failure_reason = failureReason;
      outcomeLog.claude_decision = "skipped_insufficient_data";
      outcomeLog.missing_evidence_count = evidence.missing.length;
    } else {
      currentFacts.sufficient = true;
      const after = decideAfterFacts({
        forceRefresh,
        sufficient: true,
        prior,
        currentFacts,
      });
      if (after.kind === "skip" && after.decision === "skipped_unchanged" && prior) {
        outcomeLog.claude_decision = "skipped_unchanged";
        outcomeLog.outcome = "succeeded";
        const skipped = await completeSkip(supabase, {
          requestId, owner, ticker, runId,
          decision: "skipped_unchanged",
          extendValidThrough: computeValidThrough(analyzedAtMs, sessionType),
        });
        if (!skipped.ok) {
          outcomeLog.outcome = "failed";
          outcomeLog.failure_reason = "UPSTREAM_ERROR";
          outcomeLog.claude_decision = "error";
          return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
        }
        return finish(jsonResponse(200, {
          status: "succeeded",
          request_id: requestId,
          ticker,
          direction: prior.direction,
          session_type: sessionType,
          session_date: sessionDate,
          alerts_created: 0,
          replayed: false,
          claude_decision: "skipped_unchanged",
        }));
      }

      const created = createWatchlistAiAdapter(aiConfig);
      if (!created.ok) {
        outcomeLog.outcome = "failed";
        outcomeLog.failure_reason = "UPSTREAM_ERROR";
        outcomeLog.claude_decision = "error";
        outcomeLog.ai_provider = aiConfig.provider;
        outcomeLog.ai_model = aiConfig.model;
        outcomeLog.ai_fallback = "off";
        return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
      }
      const intended = after.kind === "call"
        ? after.decision
        : "claude_called_expired_changed";
      const exclusive = await runExclusiveClaudeCall({
        store: createRpcTickerLeaseStore(supabase),
        key: { ticker, sessionDate, sessionType },
        requestId,
        forceRefresh,
        intendedDecision: intended,
        now: analyzedAt,
        prior,
        leaseSeconds: TICKER_LEASE_SECONDS,
        recheckPrior: async () => {
          const { data } = await supabase
            .from("watchlist_analysis_v2")
            .select(
              "ticker, session_date, session_type, valid_through, direction, explanation, failure_reason, change_pct, volume, rvol_class, market_signals, recent_events, inputs_quality",
            )
            .eq("ticker", ticker)
            .maybeSingle();
          return parsePriorAnalysis(data);
        },
        callClaude: async () => {
          const catalog = buildEvidenceCatalog({
            market_signals: marketSignals,
            recent_events: recentEvents,
            key_levels: keyLevels,
            metrics: [
              ...(rvolRes.rvol !== null ? ["rvol"] : []),
              ...(basis.change_pct !== null ? ["change_pct"] : []),
            ],
          });
          const prompt = buildAiPrompt({
            ticker, session_type: sessionType, session_date: sessionDate,
            price: basis.price, change_pct: basis.change_pct, volume: basis.volume,
            rvol: rvolRes.rvol, rvol_class: rvolRes.rvol_class,
            key_levels: keyLevels, market_signals: marketSignals, recent_events: recentEvents,
            reason_codes: reasonCodes,
          }, catalog);
          const result = await generateWatchlistAnalysis(created.adapter, { prompt, catalog });
          applyAiCallMeta(outcomeLog, result.meta, intended);
          emitWatchlistAiCallLog(result.meta, result.kind === "ok", intended);
          if (runId) {
            await recordProviderCall(supabase, runId, result.meta, result.kind === "ok");
          }
          return result;
        },
      });
      outcomeLog.claude_decision = exclusive.decision;
      if (exclusive.decision === "error") {
        outcomeLog.outcome = "failed";
        outcomeLog.failure_reason = "UPSTREAM_ERROR";
        return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
      }
      if (
        exclusive.decision === "skipped_in_flight"
        || exclusive.decision === "skipped_still_valid"
      ) {
        const reused = exclusive.reused ?? prior;
        const skipped = await completeSkip(supabase, {
          requestId, owner, ticker, runId,
          decision: exclusive.decision,
          extendValidThrough: null,
        });
        if (!skipped.ok) {
          outcomeLog.outcome = "failed";
          outcomeLog.failure_reason = "UPSTREAM_ERROR";
          outcomeLog.claude_decision = "error";
          return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
        }
        outcomeLog.outcome = reused && reused.direction !== "data_unavailable"
          ? "succeeded"
          : "data_unavailable";
        return finish(jsonResponse(200, {
          status: "succeeded",
          request_id: requestId,
          ticker,
          direction: reused?.direction ?? "data_unavailable",
          session_type: sessionType,
          session_date: sessionDate,
          alerts_created: 0,
          replayed: false,
          claude_decision: exclusive.decision,
        }));
      }

      const outcome = exclusive.value;
      if (!outcome) {
        outcomeLog.outcome = "failed";
        outcomeLog.failure_reason = "UPSTREAM_ERROR";
        outcomeLog.claude_decision = "error";
        return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
      }
      if (outcome.kind === "ok") {
        direction = outcome.value.direction;
        explanation = outcome.value.explanation;
        driverIds = outcome.value.driver_ids;
        outcomeLog.outcome = direction === "data_unavailable" ? "data_unavailable" : "succeeded";
        outcomeLog.failure_reason = direction === "data_unavailable" ? (failureReason ?? "UNKNOWN") : null;
        outcomeLog.ai_http_status = outcome.meta.http_status ?? 200;
        if (outcome.meta.provider === "anthropic") {
          outcomeLog.anthropic_http_status = outcome.meta.http_status ?? 200;
        }
        outcomeLog.missing_evidence_count = evidence.missing.length;
        if (evidence.no_verified_catalyst && !explanation.includes("No verified ticker-specific catalyst available.")) {
          explanation = `${explanation} No verified ticker-specific catalyst available.`.trim();
          if (explanation.length > 240) explanation = explanation.slice(0, 240).trim();
        }
      } else if (outcome.kind === "transport_failure") {
        const code = logProviderFailure(ticker, "watchlist_ai", outcome);
        outcomeLog.outcome = "failed";
        outcomeLog.failure_reason = code;
        outcomeLog.provider_stage = "watchlist_ai";
        outcomeLog.ai_http_status = outcome.http_status;
        if (outcome.meta.provider === "anthropic") {
          outcomeLog.provider_stage = "anthropic_ai";
          outcomeLog.anthropic_http_status = outcome.http_status;
        }
        outcomeLog.missing_evidence_count = evidence.missing.length;
        outcomeLog.claude_decision = "error";
        return finish(await failAndRespond(supabase, requestId, owner, runId, code));
      } else {
        outcomeLog.outcome = "failed";
        outcomeLog.failure_reason = "AI_VALIDATION_FAILED";
        outcomeLog.provider_stage = "watchlist_ai";
        outcomeLog.missing_evidence_count = evidence.missing.length;
        outcomeLog.claude_decision = "error";
        return finish(await failAndRespond(supabase, requestId, owner, runId, "AI_VALIDATION_FAILED"));
      }
    }
  }

  // Contract: data_unavailable must never carry AI drivers or market signals.
  // Independently validated fields (price, bars, volume, events, key levels) are preserved.
  const sanitized = sanitizeUnavailableEvidence({
    direction, driverIds, marketSignals,
  });

  // Build payload
  const validThrough = computeValidThrough(analyzedAtMs, sessionType);
  const payload: AnalysisV2Payload = {
    ticker, contract_version: CONTRACT_VERSION,
    session_date: sessionDate, session_type: sessionType, valid_through: validThrough,
    direction, explanation, driver_ids: sanitized.driverIds, failure_reason: failureReason,
    price: basis.price, change_pct: basis.change_pct,
    intraday: bars,
    volume: basis.volume !== null ? Math.round(basis.volume) : null,
    rvol: rvolRes.rvol, rvol_class: rvolRes.rvol_class,
    market_signals: sanitized.marketSignals, recent_events: recentEvents,
    key_levels: keyLevels, inputs_quality: inputsQuality,
    analyzed_at: analyzedAtIso, run_id: runId,
  };



  const forbidden = containsForbiddenKey(payload);
  if (forbidden) {
    console.error(`${LOG_PREFIX} forbidden key blocked: ${sanitize(forbidden)}`);
    outcomeLog.outcome = "failed";
    outcomeLog.failure_reason = "UPSTREAM_ERROR";
    return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
  }
  const validated = validateAnalysisV2Payload(payload);
  if (!validated.ok) {
    console.error(`${LOG_PREFIX} payload validation failed`);
    outcomeLog.outcome = "failed";
    outcomeLog.failure_reason = "UNKNOWN";
    return finish(await failAndRespond(supabase, requestId, owner, runId, "UNKNOWN"));
  }

  const alerts: AlertCandidate[] = buildAlerts({
    ticker, sessionDate, sessionType, analyzedAtIso, analyzedAtMs,
    marketSignals: sanitized.marketSignals, recentEvents,
    rvol: rvolRes.rvol, rvolClass: rvolRes.rvol_class,
    direction, priorDirection, earningsDate,
  });



  // Finalize
  let rpcResp: { data: unknown; error: { message: string } | null };
  try {
    rpcResp = await supabase.rpc("finalize_watchlist_analysis_v2", {
      p_request_id: requestId, p_user_id: owner, p_ticker: ticker,
      p_payload: payload, p_alerts: alerts, p_run_id: runId,
    });
  } catch {
    outcomeLog.outcome = "unresolved";
    return finish(await rereadRequest(supabase, requestId));
  }
  if (rpcResp.error) {
    console.error(`${LOG_PREFIX} finalize rpc failed`);
    outcomeLog.outcome = "failed";
    outcomeLog.failure_reason = "UPSTREAM_ERROR";
    return finish(await failAndRespond(supabase, requestId, owner, runId, "UPSTREAM_ERROR"));
  }

  if (outcomeLog.claude_decision === "skipped_insufficient_data") {
    await recordClaudeDecision(supabase, runId, "skipped_insufficient_data");
  } else if (
    outcomeLog.claude_decision === "claude_called_new"
    || outcomeLog.claude_decision === "claude_called_expired_changed"
    || outcomeLog.claude_decision === "claude_called_manual"
  ) {
    await recordClaudeDecision(supabase, runId, outcomeLog.claude_decision);
  }

  const rpcData = (rpcResp.data ?? {}) as { status?: string; alerts_created?: number };
  const replayed = rpcData.status === "already_finalized";
  const alertsCreated = typeof rpcData.alerts_created === "number" ? rpcData.alerts_created : 0;

  const respBody: Record<string, unknown> = {
    status: "succeeded", request_id: requestId, ticker, direction,
    session_type: sessionType, session_date: sessionDate,
    alerts_created: alertsCreated, replayed,
    claude_decision: outcomeLog.claude_decision,
  };
  if (direction === "data_unavailable") {
    respBody.failure_reason = failureReason;
    respBody.explanation = explanation;
    outcomeLog.outcome = "data_unavailable";
    outcomeLog.failure_reason = failureReason;
  } else {
    outcomeLog.outcome = "succeeded";
  }
  return finish(jsonResponse(200, respBody));
}

if (import.meta.main) serve(handleRequest);

function mapTransportErr(code: string): ErrorCode {
  if (code === "RATE_LIMITED") return "RATE_LIMITED";
  if (code === "PROVIDER_TIMEOUT") return "PROVIDER_TIMEOUT";
  return "PROVIDER_ERROR";
}

async function completeSkip(
  supabase: ServiceClient,
  args: {
    requestId: string;
    owner: string;
    ticker: string;
    runId: string | null;
    decision: "skipped_still_valid" | "skipped_unchanged" | "skipped_in_flight";
    extendValidThrough: string | null;
  },
): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc("skip_watchlist_analysis_v2", {
    p_request_id: args.requestId,
    p_user_id: args.owner,
    p_ticker: args.ticker,
    p_run_id: args.runId,
    p_decision: args.decision,
    p_extend_valid_through: args.extendValidThrough,
  });
  if (error) console.error(`${LOG_PREFIX} skip rpc failed`);
  return { ok: !error };
}

function applyAiCallMeta(
  outcomeLog: AnalyzerOutcomeLog,
  meta: WatchlistAiCallMeta,
  _decision: string,
): void {
  outcomeLog.ai_provider = meta.provider;
  outcomeLog.ai_model = meta.model;
  outcomeLog.ai_http_status = meta.http_status;
  outcomeLog.ai_latency_ms = meta.latency_ms;
  outcomeLog.ai_input_tokens = meta.usage.input_tokens;
  outcomeLog.ai_output_tokens = meta.usage.output_tokens;
  outcomeLog.ai_retry_count = meta.retry_count;
  outcomeLog.ai_fallback = "off";
}

async function recordProviderCall(
  supabase: ServiceClient,
  runId: string,
  meta: WatchlistAiCallMeta,
  ok: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("record_wl_v2_provider_call", {
    p_run_id: runId,
    p_provider: meta.provider,
    p_model: meta.model,
    p_ok: ok,
    p_latency_ms: meta.latency_ms,
    p_input_tokens: meta.usage.input_tokens,
    p_output_tokens: meta.usage.output_tokens,
    p_retry_count: meta.retry_count,
  });
  if (error) console.error(`${LOG_PREFIX} provider call rpc failed`);
}

async function recordClaudeDecision(
  supabase: ServiceClient,
  runId: string | null,
  decision: import("../_shared/watchlist-v2/cost-control.ts").ClaudeDecision,
): Promise<void> {
  if (!runId) return;
  const { error } = await supabase.rpc("record_wl_v2_claude_decision", {
    p_run_id: runId,
    p_decision: decision,
  });
  if (error) console.error(`${LOG_PREFIX} claude decision rpc failed`);
}

async function failAndRespond(
  supabase: ServiceClient,
  requestId: string,
  owner: string,
  runId: string | null,
  code: ErrorCode,
): Promise<Response> {
  await recordClaudeDecision(supabase, runId, "error");
  const { error } = await supabase.rpc("fail_watchlist_analysis_v2", {
    p_request_id: requestId, p_user_id: owner, p_error_code: code,
  });
  if (error) console.error(`${LOG_PREFIX} fail rpc error`);
  return jsonResponse(200, {
    status: "failed", request_id: requestId, error_code: code, claude_decision: "error",
  });
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
