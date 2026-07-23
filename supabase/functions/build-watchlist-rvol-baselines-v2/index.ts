// W2-P4 — Watchlist V2 RVOL baseline builder.
// Auth: canonical SYNC_SECRET only. Never logs the secret.
// For each unique real ticker in public.watchlists, fetches real Polygon
// 1-minute aggregates over a bounded historical window, groups by ET RTH
// session, builds the canonical 390-point cumulative curve, and upserts
// public.watchlist_rvol_baseline. Skips honestly when < 10 compatible sessions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeMatch } from "../_shared/timing-safe.ts";
import { LOG_PREFIX, sanitize } from "../_shared/watchlist-v2/sanitize.ts";
import { etParts, type UpcomingRow } from "../_shared/watchlist-v2/session.ts";
import { fetchWithOutcome } from "../_shared/watchlist-v2/market-data.ts";
import { applyCursor, deriveUniqueTickers } from "../_shared/watchlist-v2/batch.ts";
import { buildBaselineFromBars, MIN_SESSIONS } from "../_shared/watchlist-v2/baseline.ts";

const MAX_TICKERS_PER_INVOCATION = 5;
const MAX_CONCURRENCY = 2;
const BUDGET_MS = 20_000;
const LEASE_SECONDS = 3 * 60;
// 30 calendar-day history window ≈ ~20 trading sessions.
const HISTORY_DAYS = 30;
const AGG_TIMEOUT_MS = 12_000;

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

// Determine the most recent completed US trading session date (ET), skipping
// weekends and Polygon-reported full-day holidays. Fails closed on ambiguity.
export async function resolveMostRecentCompletedSession(
  now: Date, polygonKey: string,
): Promise<{ ok: true; date: string } | { ok: false; reason: string }> {
  const et = etParts(now);
  // Regular-hour close = 16:00 ET (960 min). Before that, "today" isn't completed.
  const todayCompleted = et.minutes >= 960;
  // Get upcoming rows to identify holidays in a bounded lookback of 12 days.
  let upcoming: UpcomingRow[] = [];
  const r = await fetchWithOutcome(
    `https://api.polygon.io/v1/marketstatus/upcoming?apiKey=${polygonKey}`, 6000);
  if (r.kind !== "ok") return { ok: false, reason: "MARKETSTATUS_UNAVAILABLE" };
  upcoming = Array.isArray(r.body) ? (r.body as UpcomingRow[]) : [];
  const holidayDates = new Set<string>();
  for (const row of upcoming) {
    if (!row || typeof row !== "object") continue;
    if (row.status === "closed" && typeof row.date === "string") holidayDates.add(row.date);
  }

  const startEt = new Date(now);
  if (!todayCompleted) startEt.setUTCDate(startEt.getUTCDate() - 1);
  for (let i = 0; i < 12; i++) {
    const p = etParts(startEt);
    const wd = p.weekday;
    if (wd !== "Sat" && wd !== "Sun" && !holidayDates.has(p.date)) {
      return { ok: true, date: p.date };
    }
    startEt.setUTCDate(startEt.getUTCDate() - 1);
  }
  return { ok: false, reason: "NO_RECENT_SESSION" };
}

async function fetchMinuteAggs(ticker: string, from: string, to: string, apiKey: string): Promise<
  | { kind: "ok"; bars: unknown[] }
  | { kind: "err"; code: string }
> {
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
  const r = await fetchWithOutcome(url, AGG_TIMEOUT_MS);
  if (r.kind !== "ok") return { kind: "err", code: r.code };
  const body = r.body as { results?: unknown };
  const bars = Array.isArray(body?.results) ? (body.results as unknown[]) : [];
  return { kind: "ok", bars };
}

async function runBaselineWorker(
  supabase: SupabaseClient,
): Promise<Response> {
  const start = Date.now();
  const now = new Date();
  const polygonKey = Deno.env.get("POLYGON_API_KEY") ?? "";

  const sessionRes = await resolveMostRecentCompletedSession(now, polygonKey);
  if (!sessionRes.ok) {
    return jsonResponse(200, { status: "skipped", reason: sessionRes.reason });
  }
  const targetDate = sessionRes.date;

  const claim = await supabase.rpc("claim_wl_v2_worker", {
    p_worker: "rvol-baseline",
    p_scope: targetDate,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claim.error) return jsonResponse(500, { status: "failed", reason: "CLAIM_FAILED" });
  const claimRow = Array.isArray(claim.data) ? claim.data[0] : claim.data;
  if (!claimRow || !claimRow.run_id) return jsonResponse(200, { status: "busy" });
  const runId: string = claimRow.run_id;
  const cursorStart: string = typeof claimRow.cursor_start === "string" ? claimRow.cursor_start : "";

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

  // Skip tickers already up-to-date for targetDate.
  const alreadyDone = new Set<string>();
  if (uniq.length > 0) {
    const symbols = uniq.map((u) => u.ticker);
    const { data: existing } = await supabase
      .from("watchlist_rvol_baseline")
      .select("ticker, baseline_date")
      .in("ticker", symbols)
      .gte("baseline_date", targetDate);
    for (const r of existing ?? []) {
      const t = (r as { ticker?: string }).ticker;
      if (t) alreadyDone.add(t);
    }
  }

  const remainingAll = applyCursor(uniq, cursorStart).filter((u) => !alreadyDone.has(u.ticker));
  const slice = remainingAll.slice(0, MAX_TICKERS_PER_INVOCATION);

  const fromDate = new Date(now); fromDate.setUTCDate(fromDate.getUTCDate() - HISTORY_DAYS);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = targetDate;

  let idx = 0, processed = 0, written = 0, skipped = 0, failed = 0;
  let budgetExhausted = false;
  let lastProcessedTicker = cursorStart;
  const skipReasons: Record<string, number> = {};

  async function worker() {
    while (true) {
      if (Date.now() - start > BUDGET_MS) { budgetExhausted = true; return; }
      const my = idx++;
      if (my >= slice.length) return;
      const item = slice[my];
      const res = await fetchMinuteAggs(item.ticker, fromStr, toStr, polygonKey);
      if (res.kind !== "ok") {
        failed++;
        await supabase.rpc("record_wl_v2_run_error", {
          p_run_id: runId, p_ticker: item.ticker, p_code: res.code,
        });
      } else {
        const built = buildBaselineFromBars(res.bars, now.getTime(), targetDate);
        // Note: builder EXCLUDES sessions on/after targetDate; passing targetDate here is intentional
        // — the baseline uses only strictly-prior completed sessions.
        if (built.ok) {
          const up = await supabase.from("watchlist_rvol_baseline").upsert({
            ticker: item.ticker,
            baseline_date: built.baseline_date,
            curve: built.curve,
            sessions_used: built.sessions_used,
            computed_at: new Date().toISOString(),
          }, { onConflict: "ticker" });
          if (up.error) {
            failed++;
            await supabase.rpc("record_wl_v2_run_error", {
              p_run_id: runId, p_ticker: item.ticker, p_code: "UPSERT_FAILED",
            });
          } else {
            written++;
            await supabase.rpc("record_wl_v2_baseline_written", {
              p_run_id: runId, p_ticker: item.ticker,
            });
          }
        } else {
          skipped++;
          const reason = built.reason;
          skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
          await supabase.rpc("record_wl_v2_run_error", {
            p_run_id: runId, p_ticker: item.ticker,
            p_code: reason === "insufficient_sessions"
              ? `insufficient_sessions:${built.sessions_available}`
              : reason,
          });
        }
      }
      processed++;
      if (item.ticker.localeCompare(lastProcessedTicker) > 0) lastProcessedTicker = item.ticker;
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
    target_date: targetDate,
    attempted: processed,
    written,
    honest_skips: skipped,
    failed,
    already_up_to_date: alreadyDone.size,
    skip_reasons: skipReasons,
    min_sessions_required: MIN_SESSIONS,
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    return await runBaselineWorker(supabase);
  } catch (e) {
    console.error(`${LOG_PREFIX} baseline fatal: ${sanitize(e)}`);
    return jsonResponse(500, { status: "failed", reason: "INTERNAL" });
  }
}

if (import.meta.main) serve(handleRequest);
