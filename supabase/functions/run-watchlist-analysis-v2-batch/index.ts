// W2-P4 — Watchlist V2 batch analyzer worker.
// Auth: canonical SYNC_SECRET only (timingSafeMatch). Never logs the secret.
// Enforces the real New York trading window using the existing V2 session logic.
// Reads real public.watchlists rows; picks one deterministic legitimate owner
// per unique ticker; invokes the deployed analyze-watchlist-tickers-v2 in
// trigger mode. Never writes directly to watchlist_analysis_v2 / history / alerts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeMatch } from "../_shared/timing-safe.ts";
import { LOG_PREFIX, sanitize } from "../_shared/watchlist-v2/sanitize.ts";
import { resolveSession, type MarketStatusFetcher } from "../_shared/watchlist-v2/session.ts";
import { fetchWithOutcome } from "../_shared/watchlist-v2/market-data.ts";
import { applyCursor, deriveUniqueTickers, type UniqueTicker } from "../_shared/watchlist-v2/batch.ts";

const MAX_TICKERS_PER_INVOCATION = 25;
const MAX_CONCURRENCY = 5;
const BUDGET_MS = 40_000;                 // execution-time budget
const LEASE_SECONDS = 5 * 60;             // 5 min lease
const ANALYZER_TIMEOUT_MS = 25_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface AnalyzeOutcome {
  status: "succeeded" | "unavailable" | "failed" | "not_applicable";
  errorCode?: string;
  httpStatus: number;
}

async function invokeAnalyzer(
  supabaseUrl: string, secret: string, run_id: string, item: UniqueTicker,
): Promise<AnalyzeOutcome> {
  const url = `${supabaseUrl}/functions/v1/analyze-watchlist-tickers-v2`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        record: { symbol: item.ticker, user_id: item.owner_id },
        run_id,
      }),
      signal: AbortSignal.timeout(ANALYZER_TIMEOUT_MS),
    });
  } catch (e) {
    console.warn(`${LOG_PREFIX} analyzer transport error for ${item.ticker}: ${sanitize(e)}`);
    return { status: "failed", errorCode: "PROVIDER_TIMEOUT", httpStatus: 0 };
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* noop */ }
  const status = res.status;
  const s = typeof body?.status === "string" ? body.status : null;
  if (status === 200 && s === "succeeded") {
    // Finalized. data_unavailable direction also counts as succeeded here.
    const dir = typeof body?.direction === "string" ? body.direction : null;
    if (dir === "data_unavailable") {
      return { status: "unavailable", httpStatus: status };
    }
    return { status: "succeeded", httpStatus: status };
  }
  if (status === 422 && (body?.reason === "NON_TRADING_DAY" || body?.reason === "OUTSIDE_SESSION_WINDOW")) {
    return { status: "not_applicable", errorCode: String(body.reason), httpStatus: status };
  }
  const code = typeof body?.error_code === "string" ? body.error_code
    : typeof body?.error === "string" ? body.error
    : "UPSTREAM_ERROR";
  return { status: "failed", errorCode: code, httpStatus: status };
}

async function runBatch(
  supabase: SupabaseClient, supabaseUrl: string, secret: string,
): Promise<Response> {
  const start = Date.now();
  const analyzedAt = new Date();

  // 1. Resolve session
  const polygonKey = Deno.env.get("POLYGON_API_KEY") ?? "";
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
      return Array.isArray(r.body) ? (r.body as []) : [];
    },
  };
  const session = await resolveSession(analyzedAt, marketStatus);
  if (!session.ok) {
    return jsonResponse(200, {
      status: "skipped",
      reason: session.reason,
    });
  }

  const scope = session.session_date;

  // 2. Claim lease
  const claim = await supabase.rpc("claim_wl_v2_worker", {
    p_worker: "batch-analysis",
    p_scope: scope,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) {
    console.error(`${LOG_PREFIX} claim rpc error`);
    return jsonResponse(500, { status: "failed", reason: "CLAIM_FAILED" });
  }
  const claimRow = Array.isArray(claim.data) ? claim.data[0] : claim.data;
  if (!claimRow || !claimRow.run_id) {
    return jsonResponse(200, { status: "busy" });
  }
  const runId: string = claimRow.run_id;
  const cursorStart: string = typeof claimRow.cursor_start === "string" ? claimRow.cursor_start : "";

  // 3. Load unique tickers with deterministic owners
  const { data: rows, error: watchErr } = await supabase
    .from("watchlists")
    .select("symbol, user_id");
  if (watchErr) {
    await supabase.rpc("complete_wl_v2_run", {
      p_run_id: runId, p_status: "failed", p_cursor_end: cursorStart,
    });
    return jsonResponse(500, { status: "failed", reason: "WATCHLIST_QUERY_FAILED" });
  }
  const uniq = deriveUniqueTickers(rows ?? []);
  const remainingAll = applyCursor(uniq, cursorStart);
  const slice = remainingAll.slice(0, MAX_TICKERS_PER_INVOCATION);

  if (slice.length === 0) {
    // Nothing left: mark completed and reset any resume state.
    await supabase.rpc("complete_wl_v2_run", {
      p_run_id: runId, p_status: "completed", p_cursor_end: cursorStart,
    });
    return jsonResponse(200, {
      status: "completed", run_id: runId, session_type: session.session_type,
      session_date: session.session_date, attempted: 0,
    });
  }

  // 4. Process with bounded concurrency and budget
  let idx = 0;
  let processed = 0;
  let budgetExhausted = false;
  let lastProcessedTicker = cursorStart;
  const counters = { succeeded: 0, unavailable: 0, failed: 0, not_applicable: 0 };

  async function worker() {
    while (true) {
      if (Date.now() - start > BUDGET_MS) { budgetExhausted = true; return; }
      const my = idx++;
      if (my >= slice.length) return;
      const item = slice[my];
      const outcome = await invokeAnalyzer(supabaseUrl, secret, runId, item);
      if (outcome.status === "succeeded") counters.succeeded++;
      else if (outcome.status === "unavailable") counters.unavailable++;
      else if (outcome.status === "not_applicable") counters.not_applicable++;
      else {
        counters.failed++;
        await supabase.rpc("record_wl_v2_run_error", {
          p_run_id: runId, p_ticker: item.ticker, p_code: outcome.errorCode ?? "UPSTREAM_ERROR",
        });
      }
      processed++;
      if (item.ticker.localeCompare(lastProcessedTicker) > 0) lastProcessedTicker = item.ticker;
      // Checkpoint every 5 tickers
      if (processed % 5 === 0) {
        await supabase.rpc("checkpoint_wl_v2_cursor", {
          p_run_id: runId, p_cursor: lastProcessedTicker,
        });
      }
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, slice.length); i++) workers.push(worker());
  await Promise.all(workers);

  const remainingAfter = remainingAll.length - processed;
  const nextStatus = (budgetExhausted || remainingAfter > 0) ? "budget_resumed" : "completed";

  await supabase.rpc("complete_wl_v2_run", {
    p_run_id: runId, p_status: nextStatus, p_cursor_end: lastProcessedTicker,
  });

  return jsonResponse(200, {
    status: nextStatus,
    run_id: runId,
    session_type: session.session_type,
    session_date: session.session_date,
    attempted: processed,
    counters,
    remaining_after: Math.max(0, remainingAfter),
  });
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse(401, { error: "unauthorized" });
  const token = authHeader.slice(7).trim();
  const secret = Deno.env.get("SYNC_SECRET");
  if (!(await timingSafeMatch(token, secret))) return jsonResponse(401, { error: "unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(
    supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    return await runBatch(supabase, supabaseUrl, token);
  } catch (e) {
    console.error(`${LOG_PREFIX} batch fatal: ${sanitize(e)}`);
    return jsonResponse(500, { status: "failed", reason: "INTERNAL" });
  }
}

if (import.meta.main) serve(handleRequest);
