// sync-catalyst-events — CATALYST-P1 backbone ingestor.
// Server/cron only. Bearer SYNC_SECRET, timing-safe. OPTIONS + POST only.
// Reads earnings_calendar (-7 to +30 days) and Polygon reference news,
// classifies deterministically, and upserts into public.catalyst_events
// idempotently by dedupe_key. Never mutates upstream tables.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeMatch } from "../_shared/timing-safe.ts";
import {
  type CatalystEventRow,
  earningsDedupeKey,
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
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

async function ingestEarnings(
  supabase: ReturnType<typeof createClient>,
  summary: CatalystSummary,
): Promise<CatalystEventRow[]> {
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

  if (error) {
    console.error("earnings_calendar read failed");
    return [];
  }

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
    if (isFiniteNumber(r.surprise_percent)) {
      facts.surprise_percent = r.surprise_percent;
    }

    const tod = normalizeTimeOfDay(r.time_of_day);

    rows.push({
      dedupe_key: key,
      symbol,
      company_name: nonEmptyTrimmed(r.company_name),
      event_type: "earnings",
      verification_state: "provider_reported",
      event_date: reportDate,
      event_time: null,
      time_of_day: tod,
      title: null,
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
  return rows;
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

async function fetchPolygonNews(apiKey: string): Promise<PolygonNewsItem[] | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/reference/news?limit=100&order=desc&sort=published_utc&apiKey=${apiKey}`,
      { signal: controller.signal },
    );
    if (!res.ok) {
      console.error(`polygon news http ${res.status}`);
      // Drain body without inspection
      try { await res.text(); } catch { /* ignore */ }
      return null;
    }
    const json = await res.json().catch(() => null) as unknown;
    if (!json || typeof json !== "object") return null;
    const results = (json as { results?: unknown }).results;
    if (!Array.isArray(results)) return null;
    return results as PolygonNewsItem[];
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function enrichCompanyNames(
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  summary: CatalystSummary,
): Promise<CatalystEventRow[]> {
  const raw = await fetchPolygonNews(apiKey);
  if (raw === null) return [];

  // First pass: validate items and collect tickers.
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

  for (const item of raw) {
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

  // Second pass: expand to one row per ticker.
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
  return rows;
}

async function upsertEvents(
  supabase: ReturnType<typeof createClient>,
  rows: CatalystEventRow[],
  summary: CatalystSummary,
): Promise<void> {
  if (rows.length === 0) return;
  // Chunk to keep payload sizes bounded.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error, count } = await supabase
      .from("catalyst_events")
      .upsert(chunk, { onConflict: "dedupe_key", count: "exact" });
    if (error) {
      console.error(`catalyst_events upsert failed size=${chunk.length}`);
      summary.events_rejected += chunk.length;
      continue;
    }
    summary.events_upserted += typeof count === "number" ? count : chunk.length;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return respond(405, { error: "method_not_allowed" });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  if (!syncSecret) {
    return respond(500, { error: "server_auth_not_configured" });
  }
  const ok = await timingSafeMatch(auth, `Bearer ${syncSecret}`);
  if (!ok) {
    return respond(403, { error: "forbidden" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const polygonKey = Deno.env.get("POLYGON_API_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return respond(500, { error: "server_config_missing" });
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const summary = makeEmptySummary();

  try {
    const earningsRows = await ingestEarnings(supabase, summary);
    const newsRows = polygonKey
      ? await ingestPolygonNews(supabase, polygonKey, summary)
      : [];
    await upsertEvents(supabase, [...earningsRows, ...newsRows], summary);
  } catch (_e) {
    // Never leak provider bodies or stack details.
    console.error("sync-catalyst-events fatal");
    return respond(500, { error: "internal_error" });
  }

  return respond(200, sanitizeSummary(summary));
});
