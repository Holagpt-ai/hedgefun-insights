// sync-catalyst-events — CATALYST-P1 backbone ingestor.
// Server/cron only. Bearer SYNC_SECRET, timing-safe. OPTIONS + POST only.
// Reads earnings_calendar (-7 to +30 days) and Polygon reference news,
// classifies deterministically, and upserts into public.catalyst_events
// idempotently by dedupe_key. Never mutates upstream tables.
// Logs only sanitized aggregate counts under [catalyst-sync].

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeMatch } from "../_shared/timing-safe.ts";
import {
  type CatalystEventRow,
  earningsDedupeKey,
  earningsDisplayTitle,
  isFiniteNumber,
  isHttpsUrl,
  isValidTicker,
  nonEmptyTrimmed,
  normalizeTitleForHash,
  polygonDedupeKey,
  sha256Hex,
  type TimeOfDay,
} from "../_shared/catalyst/contract.ts";
import { classifyCatalyst } from "../_shared/catalyst/classify.ts";
import {
  type CatalystSummary,
  makeEmptySummary,
  sanitizeFacts,
  sanitizeSummary,
} from "../_shared/catalyst/sanitize.ts";

type ReasonCode =
  | "AUTH_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "DATABASE_ERROR"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function respondJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function respondError(status: number, code: ReasonCode): Response {
  return respondJson(status, { error: code });
}

function log(code: ReasonCode | "OK", counts?: Partial<CatalystSummary>): void {
  const safe = counts ? sanitizeSummary({ ...makeEmptySummary(), ...counts }) : undefined;
  if (safe) {
    console.log(
      `[catalyst-sync] ${code} earnings_read=${safe.earnings_read} news_read=${safe.news_read} validated=${safe.events_validated} upserted=${safe.events_upserted} rejected=${safe.events_rejected}`,
    );
  } else {
    console.log(`[catalyst-sync] ${code}`);
  }
}

function normalizeTimeOfDay(x: unknown): TimeOfDay | null {
  if (typeof x !== "string") return null;
  const t = x.trim().toLowerCase();
  if (t === "before_open" || t === "bmo" || t === "before market open") return "before_open";
  if (t === "after_close" || t === "amc" || t === "after market close") return "after_close";
  if (t === "during" || t === "dmh" || t === "during market hours") return "during";
  if (t === "unknown" || t === "") return "unknown";
  return "unknown";
}

function ymdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysUTC(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

type SbClient = ReturnType<typeof createClient<any, "public", any>>;

async function ingestEarnings(
  supabase: SbClient,
  summary: CatalystSummary,
): Promise<{ rows: CatalystEventRow[]; ok: boolean }> {
  const today = new Date();
  const from = ymdUTC(addDaysUTC(today, -7));
  const to = ymdUTC(addDaysUTC(today, 30));

  const { data, error } = await supabase
    .from("earnings_calendar")
    .select(
      "symbol, company_name, report_date, estimate_eps, actual_eps, surprise_percent, time_of_day",
    )
    .gte("report_date", from)
    .lte("report_date", to);

  if (error) return { rows: [], ok: false };

  const rows: CatalystEventRow[] = [];
  const seen = new Set<string>();
  for (const raw of data ?? []) {
    summary.earnings_read += 1;
    const r = raw as Record<string, unknown>;
    const symbol = nonEmptyTrimmed(r.symbol);
    const reportDate = nonEmptyTrimmed(r.report_date);
    if (!symbol || !isValidTicker(symbol) || !reportDate) {
      summary.events_rejected += 1;
      continue;
    }
    const key = earningsDedupeKey(symbol, reportDate);
    if (seen.has(key)) continue;
    seen.add(key);

    const facts: Record<string, unknown> = {};
    if (isFiniteNumber(r.estimate_eps)) facts.estimate_eps = r.estimate_eps;
    if (isFiniteNumber(r.actual_eps)) facts.actual_eps = r.actual_eps;
    if (isFiniteNumber(r.surprise_percent)) facts.surprise_percent = r.surprise_percent;

    const tod = normalizeTimeOfDay(r.time_of_day);

    const companyName = nonEmptyTrimmed(r.company_name);
    rows.push({
      dedupe_key: key,
      symbol,
      company_name: companyName,
      event_type: "earnings",
      verification_state: "provider_reported",
      event_date: reportDate,
      event_time: null,
      time_of_day: tod,
      title: earningsDisplayTitle(companyName, symbol),
      description: null,
      source_name: "Earnings Calendar",
      source_url: null,
      provider: "earnings_calendar",
      provider_article_id: null,
      related_symbols: [],
      facts: sanitizeFacts(facts),
      published_at: null,
    });
    summary.events_validated += 1;
  }
  return { rows, ok: true };
}

interface PolygonNewsItem {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  article_url?: unknown;
  published_utc?: unknown;
  tickers?: unknown;
  publisher?: unknown;
}

interface PolygonFetchResult {
  items: PolygonNewsItem[] | null;
  reason: ReasonCode | null;
}

async function fetchPolygonNews(apiKey: string): Promise<PolygonFetchResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/reference/news?limit=100&order=desc&sort=published_utc&apiKey=${apiKey}`,
      { signal: controller.signal },
    );
    // Always drain body without inspection.
    let bodyText = "";
    try { bodyText = await res.text(); } catch { /* ignore */ }
    if (!res.ok) {
      if (res.status === 429) return { items: null, reason: "PROVIDER_RATE_LIMITED" };
      return { items: null, reason: "PROVIDER_ERROR" };
    }
    let json: unknown = null;
    try { json = JSON.parse(bodyText); } catch { return { items: null, reason: "PROVIDER_ERROR" }; }
    if (!json || typeof json !== "object") return { items: null, reason: "PROVIDER_ERROR" };
    const results = (json as { results?: unknown }).results;
    if (!Array.isArray(results)) return { items: null, reason: "PROVIDER_ERROR" };
    return { items: results as PolygonNewsItem[], reason: null };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { items: null, reason: "PROVIDER_TIMEOUT" };
    }
    return { items: null, reason: "PROVIDER_ERROR" };
  } finally {
    clearTimeout(t);
  }
}

async function enrichCompanyNames(
  supabase: SbClient,
  symbols: Set<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (symbols.size === 0) return out;
  const list = Array.from(symbols);
  const { data, error } = await supabase
    .from("stocks")
    .select("symbol, name")
    .in("symbol", list);
  if (error || !data) return out;
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const sym = nonEmptyTrimmed(r.symbol);
    const nm = nonEmptyTrimmed(r.name);
    if (sym && nm) out.set(sym, nm);
  }
  return out;
}

async function ingestPolygonNews(
  supabase: SbClient,
  apiKey: string,
  summary: CatalystSummary,
): Promise<{ rows: CatalystEventRow[]; reason: ReasonCode | null }> {
  const fetched = await fetchPolygonNews(apiKey);
  if (fetched.items === null) return { rows: [], reason: fetched.reason };

  interface ValidatedItem {
    title: string;
    description: string | null;
    articleUrl: string;
    publishedAt: string;
    publisherName: string;
    providerArticleId: string | null;
    tickers: string[];
  }
  const validated: ValidatedItem[] = [];
  const allSymbols = new Set<string>();

  for (const item of fetched.items) {
    summary.news_read += 1;
    const title = nonEmptyTrimmed(item.title);
    if (!title) { summary.events_rejected += 1; continue; }

    const publishedRaw = nonEmptyTrimmed(item.published_utc);
    if (!publishedRaw) { summary.events_rejected += 1; continue; }
    const publishedMs = Date.parse(publishedRaw);
    if (!Number.isFinite(publishedMs)) { summary.events_rejected += 1; continue; }
    const publishedAt = new Date(publishedMs).toISOString();

    const pub = item.publisher as Record<string, unknown> | undefined;
    const publisherName = pub ? nonEmptyTrimmed(pub.name) : null;
    if (!publisherName) { summary.events_rejected += 1; continue; }

    if (!isHttpsUrl(item.article_url)) { summary.events_rejected += 1; continue; }
    const articleUrl = item.article_url as string;

    const tks = Array.isArray(item.tickers)
      ? (item.tickers as unknown[])
        .map((x) => (typeof x === "string" ? x.trim().toUpperCase() : ""))
        .filter((s): s is string => s.length > 0 && isValidTicker(s))
      : [];
    if (tks.length === 0) { summary.events_rejected += 1; continue; }

    const providerArticleId = nonEmptyTrimmed(item.id);
    const description = nonEmptyTrimmed(item.description);

    validated.push({
      title,
      description,
      articleUrl,
      publishedAt,
      publisherName,
      providerArticleId,
      tickers: Array.from(new Set(tks)),
    });
    for (const t of tks) allSymbols.add(t);
  }

  const nameMap = await enrichCompanyNames(supabase, allSymbols);

  const rows: CatalystEventRow[] = [];
  const seen = new Set<string>();
  for (const v of validated) {
    const eventType = classifyCatalyst(v.title, v.description);
    for (const symbol of v.tickers) {
      const related = v.tickers.filter((t) => t !== symbol);
      let dedupeKey: string;
      if (v.providerArticleId) {
        dedupeKey = polygonDedupeKey(v.providerArticleId, symbol);
      } else {
        const norm = normalizeTitleForHash(v.title);
        dedupeKey = await sha256Hex(
          `${symbol}|${v.publishedAt}|${norm}|${v.publisherName}`,
        );
      }
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      rows.push({
        dedupe_key: dedupeKey,
        symbol,
        company_name: nameMap.get(symbol) ?? null,
        event_type: eventType,
        verification_state: "provider_reported",
        event_date: v.publishedAt.slice(0, 10),
        event_time: v.publishedAt,
        time_of_day: null,
        title: v.title,
        description: v.description,
        source_name: v.publisherName,
        source_url: v.articleUrl,
        provider: "polygon",
        provider_article_id: v.providerArticleId,
        related_symbols: related,
        facts: {},
        published_at: v.publishedAt,
      });
      summary.events_validated += 1;
    }
  }
  return { rows, reason: null };
}

async function upsertEvents(
  supabase: SbClient,
  rows: CatalystEventRow[],
  summary: CatalystSummary,
): Promise<boolean> {
  if (rows.length === 0) return true;
  const CHUNK = 200;
  let anyErr = false;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error, count } = await supabase
      .from("catalyst_events")
      .upsert(chunk as never[], { onConflict: "dedupe_key", count: "exact" });
    if (error) {
      anyErr = true;
      summary.events_rejected += chunk.length;
      continue;
    }
    summary.events_upserted += typeof count === "number" ? count : chunk.length;
  }
  return !anyErr;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    log("METHOD_NOT_ALLOWED");
    return respondError(405, "METHOD_NOT_ALLOWED");
  }

  const auth = req.headers.get("Authorization") ?? "";
  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  if (!syncSecret) {
    log("AUTH_FAILED");
    return respondError(500, "AUTH_FAILED");
  }
  const ok = await timingSafeMatch(auth, `Bearer ${syncSecret}`);
  if (!ok) {
    log("AUTH_FAILED");
    return respondError(403, "AUTH_FAILED");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const polygonKey = Deno.env.get("POLYGON_API_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    log("VALIDATION_ERROR");
    return respondError(500, "VALIDATION_ERROR");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const summary = makeEmptySummary();

  try {
    const earnings = await ingestEarnings(supabase, summary);
    if (!earnings.ok) {
      log("DATABASE_ERROR", summary);
      return respondError(500, "DATABASE_ERROR");
    }
    let newsRows: CatalystEventRow[] = [];
    if (polygonKey) {
      const news = await ingestPolygonNews(supabase, polygonKey, summary);
      newsRows = news.rows;
      if (news.reason) {
        // Provider failure — never delete prior legitimate events; still upsert
        // earnings rows, then log the reason and return sanitized failure.
        await upsertEvents(supabase, earnings.rows, summary);
        log(news.reason, summary);
        return respondError(502, news.reason);
      }
    }
    const ok = await upsertEvents(supabase, [...earnings.rows, ...newsRows], summary);
    if (!ok) {
      log("DATABASE_ERROR", summary);
      return respondError(500, "DATABASE_ERROR");
    }
    log("OK", summary);
    return respondJson(200, sanitizeSummary(summary));
  } catch {
    log("UNKNOWN", summary);
    return respondError(500, "UNKNOWN");
  }
});
