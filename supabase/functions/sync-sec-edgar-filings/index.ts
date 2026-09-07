// sync-sec-edgar-filings — SEC EDGAR ingestion backbone (V1A).
// Server/cron only. Bearer SYNC_SECRET, timing-safe. OPTIONS + POST only.
// FACT-ONLY ingestion: stores verified SEC filing metadata without interpretation.
// No cron wiring, no deployment behavior, and no destructive mutations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeMatch } from "../_shared/timing-safe.ts";
import {
  createSecRequester,
  emptySecSummary,
  parseCompanyTickersExchangeJson,
  parseLatestFilingsAtom,
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
  SEC_LATEST_FILINGS_ATOM_URL,
  sanitizeSecSummary,
  type SecFetchResult,
  toCatalystRowsFromSec,
  type SecSyncSummary,
} from "../_shared/sec-edgar/ingest.ts";

type ReasonCode =
  | "AUTH_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_FORBIDDEN"
  | "PROVIDER_ERROR"
  | "DATABASE_ERROR"
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

function log(code: ReasonCode | "OK", summary?: SecSyncSummary): void {
  if (!summary) {
    console.log(`[sec-edgar-sync] ${code}`);
    return;
  }
  const s = sanitizeSecSummary(summary);
  console.log(
    `[sec-edgar-sync] ${code} feed_entries_read=${s.feed_entries_read} relevant_forms_found=${s.relevant_forms_found} mapped_issuers=${s.mapped_issuers} unmapped_issuers=${s.unmapped_issuers} rows_validated=${s.rows_validated} rows_upserted=${s.rows_upserted} rows_skipped_existing=${s.rows_skipped_existing} rows_rejected=${s.rows_rejected} sec_requests=${s.sec_requests}`,
  );
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

type SbClient = ReturnType<typeof createClient<any, "public", any>>;

type ExistingKeyRow = { dedupe_key?: unknown };

async function countExistingRows(
  supabase: SbClient,
  dedupeKeys: string[],
): Promise<Set<string> | null> {
  const found = new Set<string>();
  if (dedupeKeys.length === 0) return found;
  const chunkSize = 500;
  for (let i = 0; i < dedupeKeys.length; i += chunkSize) {
    const chunk = dedupeKeys.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("catalyst_events")
      .select("dedupe_key")
      .in("dedupe_key", chunk);
    if (error) return null;
    for (const raw of (data ?? []) as ExistingKeyRow[]) {
      if (typeof raw.dedupe_key === "string") found.add(raw.dedupe_key);
    }
  }
  return found;
}

async function upsertRows(
  supabase: SbClient,
  rows: Record<string, unknown>[],
  summary: SecSyncSummary,
): Promise<boolean> {
  if (rows.length === 0) return true;
  const existing = await countExistingRows(
    supabase,
    rows.map((r) => String(r.dedupe_key)),
  );
  if (existing === null) return false;
  summary.rows_skipped_existing += existing.size;

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from("catalyst_events")
      .upsert(chunk as never[], { onConflict: "dedupe_key", count: "exact" });
    if (error) return false;
    summary.rows_upserted += typeof count === "number" ? count : chunk.length;
  }
  return true;
}

type CikCacheState = {
  loadedAtMs: number;
  payload: ReturnType<typeof parseCompanyTickersExchangeJson> | null;
};
let cikCache: CikCacheState = { loadedAtMs: 0, payload: null };
const CIK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function loadCikMap(
  secFetch: (url: string) => Promise<SecFetchResult>,
): Promise<ReturnType<typeof parseCompanyTickersExchangeJson> | { error: ReasonCode }> {
  const now = Date.now();
  if (cikCache.payload && (now - cikCache.loadedAtMs) < CIK_CACHE_TTL_MS) {
    return cikCache.payload;
  }
  const res = await secFetch(SEC_COMPANY_TICKERS_EXCHANGE_URL);
  if (!res.ok) return { error: res.reason };
  if (!isObject(res.json)) return { error: "PROVIDER_ERROR" };
  const map = parseCompanyTickersExchangeJson(res.json);
  if (map.size === 0) return { error: "PROVIDER_ERROR" };
  cikCache = { loadedAtMs: now, payload: map };
  return map;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    log("METHOD_NOT_ALLOWED");
    return respondError(405, "METHOD_NOT_ALLOWED");
  }

  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!syncSecret) {
    log("AUTH_FAILED");
    return respondError(500, "AUTH_FAILED");
  }
  const authorized = await timingSafeMatch(auth, `Bearer ${syncSecret}`);
  if (!authorized) {
    log("AUTH_FAILED");
    return respondError(403, "AUTH_FAILED");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const secUserAgent = Deno.env.get("SEC_USER_AGENT") ?? "";
  if (!supabaseUrl || !serviceRole || !secUserAgent.trim()) {
    log("VALIDATION_ERROR");
    return respondError(500, "VALIDATION_ERROR");
  }

  const summary = emptySecSummary();
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });
  const secFetch = createSecRequester(secUserAgent.trim(), summary);

  try {
    const feedRes = await secFetch(SEC_LATEST_FILINGS_ATOM_URL);
    if (!feedRes.ok) {
      log(feedRes.reason, summary);
      return respondError(502, feedRes.reason);
    }
    const entries = parseLatestFilingsAtom(feedRes.text);
    if (entries.length === 0) {
      log("PROVIDER_ERROR", summary);
      return respondError(502, "PROVIDER_ERROR");
    }

    const cikMap = await loadCikMap(secFetch);
    if (cikMap instanceof Map === false) {
      log(cikMap.error, summary);
      return respondError(502, cikMap.error);
    }

    const rows = toCatalystRowsFromSec(entries, cikMap, summary);
    const ok = await upsertRows(supabase, rows as unknown as Record<string, unknown>[], summary);
    if (!ok) {
      log("DATABASE_ERROR", summary);
      return respondError(500, "DATABASE_ERROR");
    }

    const safe = sanitizeSecSummary(summary);
    log("OK", safe);
    return respondJson(200, safe);
  } catch {
    log("UNKNOWN", summary);
    return respondError(500, "UNKNOWN");
  }
});
