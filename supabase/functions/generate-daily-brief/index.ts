import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeMatchAny } from "../_shared/timing-safe.ts";
import { attributeSymbol } from "../_shared/catalyst/attribution.ts";
import { rankHeadlines } from "../_shared/pre-market/headlines.ts";
import {
  etDateShift,
  isoOrNull,
  normalizeSymbol,
  normalizeTimeOfDay,
} from "../_shared/pre-market/contract.ts";
import {
  AM_HEADLINE_RANK_POOL,
  AM_INDEX_SYMBOLS,
  buildAmV2Snapshot,
  buildMaterialState,
  selectBeforeOpenEarningsEvidence,
  selectDirectCatalysts,
  selectRankedHeadlines,
  validateIndexRows,
  type AmEvidenceBundle,
  type AttributedCatalystRow,
} from "../_shared/briefs/am-evidence.ts";
import { decideAmGeneration, isAmV2Snapshot } from "../_shared/briefs/am-decision.ts";
import {
  AM_MAX_TOKENS,
  AM_MODEL,
  AM_V2_SYSTEM,
  PM_MAX_TOKENS,
  PM_MODEL,
  PM_SYSTEM,
  buildAmUserPrompt,
  buildPmUserPrompt,
} from "../_shared/briefs/prompts.ts";
import { callClaude } from "./claude.ts";
import {
  emitBriefTelemetry,
  maxIndexAgeMs,
  outcomeFromIndexReason,
} from "./telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FRESHNESS_MS = 10 * 60 * 1000; // 10 minutes — PM V1 unchanged

type BriefType = "am" | "pm";

interface SymbolRow {
  symbol: string;
  current_value: number;
  change_percent: number;
  updated_at: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Deterministic ET calendar date (YYYY-MM-DD) via Intl parts. */
function etDateParts(now: Date = new Date()): {
  date: string;
  weekday: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const weekday = get("weekday"); // e.g. "Mon", "Sat", "Sun"
  return { date: `${year}-${month}-${day}`, weekday };
}

function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

function sanitizeProviderError(msg: string): string {
  return String(msg).replace(/[A-Za-z0-9_\-]{20,}/g, "***");
}

function cachedBody(row: {
  id: string;
  brief_type: string;
  brief_date: string;
  generated_at: string;
  content: string;
  market_snapshot: unknown;
}) {
  const snap = (row.market_snapshot ?? {}) as { source_checked_at?: string; evidence_checked_at?: string };
  return {
    id: row.id,
    brief_type: row.brief_type,
    brief_date: row.brief_date,
    generated_at: row.generated_at,
    content: row.content,
    cached: true,
    source_checked_at: snap.evidence_checked_at ?? snap.source_checked_at ?? row.generated_at,
  };
}

type ValidatedSchedule = {
  status: "normal" | "early-close";
  official_close_at: string;
  release_at: string;
  source: "polygon_marketstatus";
  calendar_checked_at: string;
};

function parseMarketSchedule(raw: unknown): ValidatedSchedule | { error: string } | null {
  if (raw === undefined || raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Invalid marketSchedule" };
  }
  const s = raw as Record<string, unknown>;
  const status = s.status;
  const closeAt = s.official_close_at;
  const releaseAt = s.release_at;
  const src = s.source;
  const cca = s.calendar_checked_at;
  if (status !== "normal" && status !== "early-close") {
    return { error: "Invalid marketSchedule" };
  }
  if (src !== "polygon_marketstatus") {
    return { error: "Invalid marketSchedule" };
  }
  if (typeof closeAt !== "string" || typeof releaseAt !== "string" || typeof cca !== "string") {
    return { error: "Invalid marketSchedule" };
  }
  const closeMs = Date.parse(closeAt);
  const releaseMs = Date.parse(releaseAt);
  const ccaMs = Date.parse(cca);
  if (!Number.isFinite(closeMs) || !Number.isFinite(releaseMs) || !Number.isFinite(ccaMs)) {
    return { error: "Invalid marketSchedule" };
  }
  if (releaseMs - closeMs !== 15 * 60 * 1000) {
    return { error: "Invalid marketSchedule" };
  }
  return {
    status,
    official_close_at: new Date(closeMs).toISOString(),
    release_at: new Date(releaseMs).toISOString(),
    source: "polygon_marketstatus",
    calendar_checked_at: new Date(ccaMs).toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Server-only auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
    const okAuth =
      !!presented &&
      (await timingSafeMatchAny(presented, [serviceRoleKey, syncSecret]));
    if (!okAuth) {
      return json({ error: "Unauthorized" }, 401);
    }

    let payload: { briefType?: string; marketSchedule?: unknown } = {};
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const briefType = payload.briefType as BriefType | undefined;
    if (!briefType || (briefType !== "am" && briefType !== "pm")) {
      return json({ error: "Invalid briefType" }, 400);
    }
    const startedAtMs = Date.now();

    const parsedSchedule = parseMarketSchedule(payload.marketSchedule);
    if (parsedSchedule && "error" in parsedSchedule) {
      return json({ error: parsedSchedule.error }, 400);
    }
    const validatedSchedule = parsedSchedule && !("error" in parsedSchedule) ? parsedSchedule : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!supabaseUrl || !supabaseServiceKey || !anthropicApiKey) {
      return json({ error: "Server misconfigured" }, 500);
    }

    // 3. Trading-day guard (ET)
    const { date: etDate, weekday } = etDateParts();
    if (isWeekend(weekday)) {
      return json(
        {
          available: false,
          reason: "weekend_no_trading_day",
          brief_type: briefType,
          brief_date: etDate,
        },
        200,
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingBrief } = await admin
      .from("daily_briefs")
      .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
      .eq("brief_type", briefType)
      .eq("brief_date", etDate)
      .maybeSingle();

    // ------------------------------------------------------------------ PM V1
    // Unchanged: one generation per ET date; subsequent calls return the canonical row.
    if (briefType === "pm") {
      if (existingBrief) {
        return json(cachedBody(existingBrief), 200);
      }

      const sourceCheckedAt = new Date();
      const { data: idxRows, error: idxErr } = await admin
        .from("market_indexes")
        .select("symbol, current_value, change_percent, updated_at")
        .in("symbol", AM_INDEX_SYMBOLS as unknown as string[]);

      if (idxErr) {
        console.error("market_indexes fetch failed:", idxErr.message);
        emitBriefTelemetry(startedAtMs, {
          brief_type: briefType,
          outcome: "db_error",
          reason: "source_unavailable",
          index_age_ms: null,
          anthropic_http_status: null,
          anthropic_error_type: null,
        });
        return json(
          { available: false, reason: "source_unavailable", brief_type: briefType, brief_date: etDate },
          503,
        );
      }

      const bySymbol = new Map<string, SymbolRow>();
      for (const r of (idxRows ?? []) as SymbolRow[]) {
        bySymbol.set(r.symbol, r);
      }

      const nowMs = sourceCheckedAt.getTime();
      const pmIndexAgeMs = maxIndexAgeMs(idxRows ?? [], nowMs);
      for (const sym of AM_INDEX_SYMBOLS) {
        const row = bySymbol.get(sym);
        if (!row) {
          return json(
            { available: false, reason: "source_missing_symbol", brief_type: briefType, brief_date: etDate },
            503,
          );
        }
        const cv = Number(row.current_value);
        const cp = Number(row.change_percent);
        if (!Number.isFinite(cv) || cv <= 0) {
          return json(
            { available: false, reason: "source_invalid_price", brief_type: briefType, brief_date: etDate },
            503,
          );
        }
        if (!Number.isFinite(cp)) {
          return json(
            { available: false, reason: "source_invalid_change", brief_type: briefType, brief_date: etDate },
            503,
          );
        }
        if (!row.updated_at) {
          return json(
            { available: false, reason: "source_missing_updated_at", brief_type: briefType, brief_date: etDate },
            503,
          );
        }
        const ageMs = nowMs - new Date(row.updated_at).getTime();
        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > FRESHNESS_MS) {
          emitBriefTelemetry(startedAtMs, {
            brief_type: briefType,
            outcome: "source_stale",
            reason: "source_stale",
            index_age_ms: pmIndexAgeMs,
            anthropic_http_status: null,
            anthropic_error_type: null,
          });
          return json(
            { available: false, reason: "source_stale", brief_type: briefType, brief_date: etDate },
            503,
          );
        }
      }

      const symbolsSnap: Record<string, { current_value: number; change_percent: number; updated_at: string }> = {};
      for (const sym of AM_INDEX_SYMBOLS) {
        const r = bySymbol.get(sym)!;
        symbolsSnap[sym] = {
          current_value: Number(r.current_value),
          change_percent: Number(r.change_percent),
          updated_at: r.updated_at,
        };
      }

      const userPrompt = buildPmUserPrompt(symbolsSnap);
      const generated = await callClaude({
        apiKey: anthropicApiKey,
        system: PM_SYSTEM,
        user: userPrompt,
        maxTokens: PM_MAX_TOKENS,
        model: PM_MODEL,
      });
      if (!generated.ok) {
        emitBriefTelemetry(startedAtMs, {
          brief_type: briefType,
          outcome: generated.outcome,
          reason: generated.outcome,
          index_age_ms: pmIndexAgeMs,
          anthropic_http_status: generated.httpStatus,
          anthropic_error_type: generated.errorType,
        });
        return json({ error: "Upstream generation failed" }, 502);
      }

      const marketSnapshot: Record<string, unknown> = {
        symbols: symbolsSnap,
        source: "market_indexes",
        source_checked_at: sourceCheckedAt.toISOString(),
      };
      if (validatedSchedule) {
        const closeEtDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(validatedSchedule.official_close_at));
        if (closeEtDate !== etDate) {
          return json({ error: "Invalid marketSchedule" }, 400);
        }
        marketSnapshot.market_schedule = validatedSchedule;
      }

      const generatedAt = new Date().toISOString();
      const { data: inserted, error: insertErr } = await admin
        .from("daily_briefs")
        .insert({
          brief_type: briefType,
          brief_date: etDate,
          content: generated.text,
          market_snapshot: marketSnapshot,
          generated_at: generatedAt,
        })
        .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
        .single();

      if (insertErr) {
        const isUniqueConflict =
          (insertErr as { code?: string }).code === "23505" ||
          /duplicate key|unique constraint/i.test(insertErr.message ?? "");
        if (isUniqueConflict) {
          const { data: canonical } = await admin
            .from("daily_briefs")
            .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
            .eq("brief_type", briefType)
            .eq("brief_date", etDate)
            .maybeSingle();
          if (canonical) return json(cachedBody(canonical), 200);
        }
        console.error("insert failed:", insertErr.message);
        emitBriefTelemetry(startedAtMs, {
          brief_type: briefType,
          outcome: "db_error",
          reason: "persist_failed",
          index_age_ms: pmIndexAgeMs,
          anthropic_http_status: generated.httpStatus,
          anthropic_error_type: null,
        });
        return json({ error: "Persist failed" }, 500);
      }

      emitBriefTelemetry(startedAtMs, {
        brief_type: briefType,
        outcome: "generated",
        reason: null,
        index_age_ms: pmIndexAgeMs,
        anthropic_http_status: generated.httpStatus,
        anthropic_error_type: null,
      });
      return json(
        {
          id: inserted.id,
          brief_type: inserted.brief_type,
          brief_date: inserted.brief_date,
          generated_at: inserted.generated_at,
          content: inserted.content,
          cached: false,
          source_checked_at: marketSnapshot.source_checked_at as string,
        },
        200,
      );
    }

    // ------------------------------------------------------------------ AM V2
    const sourceCheckedAt = new Date();
    const { data: idxRows, error: idxErr } = await admin
      .from("market_indexes")
      .select("symbol, current_value, change_percent, updated_at")
      .in("symbol", AM_INDEX_SYMBOLS as unknown as string[]);

    if (idxErr) {
      console.error("market_indexes fetch failed:", idxErr.message);
      emitBriefTelemetry(startedAtMs, {
        brief_type: "am",
        outcome: "db_error",
        reason: "source_unavailable",
        index_age_ms: null,
        anthropic_http_status: null,
        anthropic_error_type: null,
      });
      return json(
        { available: false, reason: "source_unavailable", brief_type: "am", brief_date: etDate },
        503,
      );
    }

    const amIndexAgeMs = maxIndexAgeMs(idxRows ?? [], sourceCheckedAt.getTime());
    const indexValidation = validateIndexRows(idxRows ?? [], sourceCheckedAt.getTime());
    if (!indexValidation.ok) {
      emitBriefTelemetry(startedAtMs, {
        brief_type: "am",
        outcome: outcomeFromIndexReason(indexValidation.reason),
        reason: indexValidation.reason,
        index_age_ms: amIndexAgeMs,
        anthropic_http_status: null,
        anthropic_error_type: null,
      });
      return json(
        {
          available: false,
          reason: indexValidation.reason,
          brief_type: "am",
          brief_date: etDate,
        },
        503,
      );
    }

    const newsLookback = new Date(sourceCheckedAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const catalystFrom = etDateShift(etDate, -2);

    const [newsRes, catRes] = await Promise.all([
      admin
        .from("market_news")
        .select("id, headline, source, url, published_at, category, description")
        .gte("published_at", newsLookback)
        .order("published_at", { ascending: false })
        .limit(80),
      admin
        .from("catalyst_events")
        .select(
          "id, symbol, company_name, provider, event_type, verification_state, event_date, event_time, time_of_day, title, source_name, published_at, updated_at, related_symbols",
        )
        .eq("verification_state", "provider_reported")
        .gte("event_date", catalystFrom)
        .lte("event_date", etDate)
        .order("event_date", { ascending: false })
        .limit(400),
    ]);

    const optionalFailed = Boolean(newsRes.error || catRes.error);
    if (optionalFailed && existingBrief && isAmV2Snapshot(existingBrief.market_snapshot)) {
      console.error(
        "am optional evidence fetch failed; returning cached V2 brief",
        newsRes.error?.message ?? catRes.error?.message ?? "",
      );
      return json(cachedBody(existingBrief), 200);
    }
    if (newsRes.error) {
      console.error("market_news fetch failed:", newsRes.error.message);
    }
    if (catRes.error) {
      console.error("catalyst_events fetch failed:", catRes.error.message);
    }

    const ranked = rankHeadlines((newsRes.data ?? []) as never, AM_HEADLINE_RANK_POOL);
    const headlines = selectRankedHeadlines(ranked);

    const attributed: AttributedCatalystRow[] = [];
    for (const r of (catRes.data ?? []) as Array<Record<string, unknown>>) {
      const symbol = normalizeSymbol(r.symbol);
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!symbol || !title) continue;
      const related = Array.isArray(r.related_symbols)
        ? r.related_symbols
          .map((x) => (typeof x === "string" ? x : ""))
          .filter(Boolean)
        : [];
      const isEarningsCal = r.provider === "earnings_calendar" && r.event_type === "earnings";
      const attr = isEarningsCal
        ? { class: "direct" as const, ticker_specific: true, reason: "earnings_calendar_record", symbol }
        : attributeSymbol({
          title,
          symbol,
          companyName: typeof r.company_name === "string" ? r.company_name : null,
          providerTickers: related,
          providerAssociatesSymbol: related.map((x) => x.toUpperCase()).includes(symbol),
        });
      attributed.push({
        id: String(r.id),
        symbol,
        title,
        provider: typeof r.provider === "string" ? r.provider : "",
        event_type: typeof r.event_type === "string" ? r.event_type : "company_news",
        event_date: typeof r.event_date === "string" ? r.event_date : "",
        verification_state: "provider_reported",
        event_time: isoOrNull(r.event_time),
        published_at: isoOrNull(r.published_at),
        source_name: typeof r.source_name === "string" ? r.source_name : null,
        attribution_class: attr.class,
        ticker_specific: attr.ticker_specific,
        time_of_day: normalizeTimeOfDay(r.time_of_day),
        updated_at: isoOrNull(r.updated_at),
      });
    }

    const catalysts = selectDirectCatalysts(attributed);
    const earnings = selectBeforeOpenEarningsEvidence(attributed, etDate);

    const bundle: AmEvidenceBundle = {
      checkedAt: sourceCheckedAt.toISOString(),
      indexes: indexValidation.indexes,
      headlines,
      catalysts,
      earnings,
    };
    const incomingState = buildMaterialState(bundle);
    const decision = decideAmGeneration({
      indexesValid: true,
      existing: existingBrief
        ? { id: existingBrief.id, market_snapshot: existingBrief.market_snapshot }
        : null,
      incomingState,
    });

    if (decision.action === "fail_closed") {
      emitBriefTelemetry(startedAtMs, {
        brief_type: "am",
        outcome: outcomeFromIndexReason(decision.reason),
        reason: decision.reason,
        index_age_ms: amIndexAgeMs,
        anthropic_http_status: null,
        anthropic_error_type: null,
      });
      return json(
        { available: false, reason: decision.reason, brief_type: "am", brief_date: etDate },
        503,
      );
    }
    if (decision.action === "return_cached" && existingBrief) {
      return json(cachedBody(existingBrief), 200);
    }

    const generated = await callClaude({
      apiKey: anthropicApiKey,
      system: AM_V2_SYSTEM,
      user: buildAmUserPrompt(bundle),
      maxTokens: AM_MAX_TOKENS,
      model: AM_MODEL,
    });
    if (!generated.ok) {
      emitBriefTelemetry(startedAtMs, {
        brief_type: "am",
        outcome: generated.outcome,
        reason: generated.outcome,
        index_age_ms: amIndexAgeMs,
        anthropic_http_status: generated.httpStatus,
        anthropic_error_type: generated.errorType,
      });
      return json({ error: "Upstream generation failed" }, 502);
    }

    const marketSnapshot = buildAmV2Snapshot(bundle, incomingState);
    const generatedAt = new Date().toISOString();

    if (decision.action === "generate" && decision.persist === "update" && existingBrief) {
      const { data: updated, error: updateErr } = await admin
        .from("daily_briefs")
        .update({
          content: generated.text,
          market_snapshot: marketSnapshot,
          generated_at: generatedAt,
        })
        .eq("id", existingBrief.id)
        .eq("brief_type", "am")
        .eq("brief_date", etDate)
        .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
        .single();
      if (updateErr || !updated) {
        console.error("am brief update failed:", updateErr?.message ?? "missing row");
        emitBriefTelemetry(startedAtMs, {
          brief_type: "am",
          outcome: "db_error",
          reason: "persist_failed",
          index_age_ms: amIndexAgeMs,
          anthropic_http_status: generated.httpStatus,
          anthropic_error_type: null,
        });
        return json({ error: "Persist failed" }, 500);
      }
      emitBriefTelemetry(startedAtMs, {
        brief_type: "am",
        outcome: "generated",
        reason: null,
        index_age_ms: amIndexAgeMs,
        anthropic_http_status: generated.httpStatus,
        anthropic_error_type: null,
      });
      return json(
        {
          id: updated.id,
          brief_type: updated.brief_type,
          brief_date: updated.brief_date,
          generated_at: updated.generated_at,
          content: updated.content,
          cached: false,
          source_checked_at: bundle.checkedAt,
        },
        200,
      );
    }

    const { data: inserted, error: insertErr } = await admin
      .from("daily_briefs")
      .insert({
        brief_type: "am",
        brief_date: etDate,
        content: generated.text,
        market_snapshot: marketSnapshot,
        generated_at: generatedAt,
      })
      .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
      .single();

    if (insertErr) {
      const isUniqueConflict =
        (insertErr as { code?: string }).code === "23505" ||
        /duplicate key|unique constraint/i.test(insertErr.message ?? "");
      if (isUniqueConflict) {
        const { data: canonical } = await admin
          .from("daily_briefs")
          .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
          .eq("brief_type", "am")
          .eq("brief_date", etDate)
          .maybeSingle();
        if (canonical) return json(cachedBody(canonical), 200);
      }
      console.error("insert failed:", insertErr.message);
      emitBriefTelemetry(startedAtMs, {
        brief_type: "am",
        outcome: "db_error",
        reason: "persist_failed",
        index_age_ms: amIndexAgeMs,
        anthropic_http_status: generated.httpStatus,
        anthropic_error_type: null,
      });
      return json({ error: "Persist failed" }, 500);
    }

    emitBriefTelemetry(startedAtMs, {
      brief_type: "am",
      outcome: "generated",
      reason: null,
      index_age_ms: amIndexAgeMs,
      anthropic_http_status: generated.httpStatus,
      anthropic_error_type: null,
    });
    return json(
      {
        id: inserted.id,
        brief_type: inserted.brief_type,
        brief_date: inserted.brief_date,
        generated_at: inserted.generated_at,
        content: inserted.content,
        cached: false,
        source_checked_at: bundle.checkedAt,
      },
      200,
    );
  } catch (e) {
    console.error("generate-daily-brief error:", sanitizeProviderError((e as Error)?.message ?? "unknown"));
    return json({ error: "Internal error" }, 500);
  }
});
