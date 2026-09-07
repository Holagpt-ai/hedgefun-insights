// sync-sec-edgar-filings handler — V1C paging + accession-anchor checkpoint.
// FACT-ONLY ingestion. Default mode is dry_run. Write requires both
// an authenticated {"mode":"write"} request and SEC_EDGAR_WRITE_ENABLED=true.
// Endpoints, paging, owner filter, and checkpoint are server-fixed.

import { timingSafeMatch } from "../_shared/timing-safe.ts";
import {
  countIncludedForms,
  isSecEdgarWriteEnabled,
  parseSecSyncRequestBody,
  sanitizeActivationSummary,
  SEC_SYNC_MAX_BODY_BYTES,
  shouldSkipSecDiscoveryForMarketHoliday,
  type CheckpointStatusLabel,
  type SecActivationSummary,
  type SecSyncMode,
} from "../_shared/sec-edgar/activation.ts";
import {
  SEC_EDGAR_STREAM_KEY,
  normalizeAnchorAccessions,
  walkLatestFilingsPages,
  type SecEdgarCheckpoint,
} from "../_shared/sec-edgar/checkpoint.ts";
import {
  createSecRequester,
  emptySecSummary,
  parseCompanyTickersExchangeJson,
  partitionNewRows,
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
  SEC_INCLUDED_FORMS,
  SEC_LATEST_FILINGS_PAGE_SIZE,
  toCatalystRowsFromSec,
  type CikTickerMap,
  type SecFetchResult,
  type SecSyncSummary,
} from "../_shared/sec-edgar/ingest.ts";

export type ReasonCode =
  | "AUTH_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "WRITE_DISABLED"
  | "CHECKPOINT_GAP"
  | "CHECKPOINT_INCONSISTENT"
  | "CHECKPOINT_WRITE_FAILED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_FORBIDDEN"
  | "PROVIDER_ERROR"
  | "DATABASE_ERROR"
  | "UNKNOWN";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

export function respondJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export function respondError(status: number, code: ReasonCode): Response {
  return respondJson(status, { error: code });
}

export type EnvReader = (key: string) => string | undefined;

export interface SecEdgarStore {
  findExistingDedupeKeys(keys: string[]): Promise<Set<string> | null>;
  insertNewRows(rows: Record<string, unknown>[]): Promise<number | null>;
  loadCheckpoint(
    streamKey: string,
  ): Promise<{ ok: true; checkpoint: SecEdgarCheckpoint | null } | { ok: false }>;
  saveCheckpoint(checkpoint: SecEdgarCheckpoint): Promise<boolean>;
}

export type HandlerDeps = {
  env: EnvReader;
  fetchFn: typeof fetch;
  store: SecEdgarStore;
  nowMs?: () => number;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function log(code: ReasonCode | "OK", summary?: SecActivationSummary): void {
  if (!summary) {
    console.log(`[sec-edgar-sync] ${code}`);
    return;
  }
  const s = sanitizeActivationSummary(summary);
  console.log(
    `[sec-edgar-sync] ${code} mode=${s.mode} checkpoint_status=${s.checkpoint_status} pages_fetched=${s.pages_fetched} entries_scanned=${s.entries_scanned} rows_validated=${s.rows_validated} rows_existing=${s.rows_existing} rows_would_insert=${s.rows_would_insert} rows_upserted=${s.rows_upserted} sec_requests=${s.sec_requests}`,
  );
}

type CikCacheState = {
  loadedAtMs: number;
  payload: CikTickerMap | null;
};
let cikCache: CikCacheState = { loadedAtMs: 0, payload: null };
const CIK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function resetSecEdgarCikCacheForTests(): void {
  cikCache = { loadedAtMs: 0, payload: null };
}

async function loadCikMap(
  secFetch: (url: string) => Promise<SecFetchResult>,
  nowMs: () => number,
): Promise<CikTickerMap | { error: ReasonCode }> {
  const now = nowMs();
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

function toSummary(
  mode: SecSyncMode,
  ingest: SecSyncSummary,
  extra: {
    checkpointPresent: boolean;
    checkpointStatus: CheckpointStatusLabel;
    boundaryReached: boolean;
    pagesFetched: number;
    entriesScanned: number;
    rowsExisting: number;
    rowsWouldInsert: number;
    formsFound: Record<string, number>;
  },
): SecActivationSummary {
  return sanitizeActivationSummary({
    mode,
    checkpoint_present: extra.checkpointPresent,
    checkpoint_status: extra.checkpointStatus,
    checkpoint_boundary_reached: extra.boundaryReached,
    pages_fetched: extra.pagesFetched,
    entries_scanned: extra.entriesScanned,
    page_size: SEC_LATEST_FILINGS_PAGE_SIZE,
    feed_entries_read: ingest.feed_entries_read,
    relevant_forms_found: ingest.relevant_forms_found,
    mapped_issuers: ingest.mapped_issuers,
    unmapped_issuers: ingest.unmapped_issuers,
    rows_validated: ingest.rows_validated,
    rows_existing: extra.rowsExisting,
    rows_would_insert: extra.rowsWouldInsert,
    rows_upserted: ingest.rows_upserted,
    rows_skipped_existing: ingest.rows_skipped_existing,
    rows_rejected: ingest.rows_rejected,
    sec_requests: ingest.sec_requests,
    forms_found: extra.formsFound,
  });
}

export async function handleSyncSecEdgarFilings(
  req: Request,
  deps: HandlerDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    log("METHOD_NOT_ALLOWED");
    return respondError(405, "METHOD_NOT_ALLOWED");
  }

  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const n = Number(contentLengthHeader);
    if (!Number.isFinite(n) || n > SEC_SYNC_MAX_BODY_BYTES) {
      log("VALIDATION_ERROR");
      return respondError(400, "VALIDATION_ERROR");
    }
  }

  const syncSecret = deps.env("SYNC_SECRET") ?? "";
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

  const bodyText = await req.text();
  const parsedMode = parseSecSyncRequestBody(bodyText);
  if (!parsedMode.ok) {
    log("VALIDATION_ERROR");
    return respondError(400, "VALIDATION_ERROR");
  }
  const mode = parsedMode.mode;

  if (mode === "write" && !isSecEdgarWriteEnabled(deps.env("SEC_EDGAR_WRITE_ENABLED"))) {
    log("WRITE_DISABLED");
    return respondError(409, "WRITE_DISABLED");
  }

  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceRole = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const secUserAgent = deps.env("SEC_USER_AGENT") ?? "";
  if (!supabaseUrl || !serviceRole || !secUserAgent.trim()) {
    log("VALIDATION_ERROR");
    return respondError(500, "VALIDATION_ERROR");
  }

  shouldSkipSecDiscoveryForMarketHoliday(true);

  const ingest = emptySecSummary();
  const secFetch = createSecRequester(secUserAgent.trim(), ingest, {
    fetchFn: deps.fetchFn,
  });
  const nowMs = deps.nowMs ?? (() => Date.now());

  try {
    const loaded = await deps.store.loadCheckpoint(SEC_EDGAR_STREAM_KEY);
    if (!loaded.ok) {
      log("DATABASE_ERROR", toSummary(mode, ingest, {
        checkpointPresent: false,
        checkpointStatus: "absent",
        boundaryReached: false,
        pagesFetched: 0,
        entriesScanned: 0,
        rowsExisting: 0,
        rowsWouldInsert: 0,
        formsFound: {},
      }));
      return respondError(500, "DATABASE_ERROR");
    }

    let anchors: string[] | null = null;
    if (loaded.checkpoint) {
      const normalized = normalizeAnchorAccessions(loaded.checkpoint.anchor_accessions);
      if (normalized === null) {
        log("CHECKPOINT_INCONSISTENT");
        return respondError(409, "CHECKPOINT_INCONSISTENT");
      }
      anchors = normalized;
    }

    const walk = await walkLatestFilingsPages(secFetch, anchors);
    const walkMeta = {
      checkpointPresent: anchors !== null,
      checkpointStatus: (walk.ok ? walk.checkpointStatus : walk.reason === "CHECKPOINT_GAP" ? "gap" : walk.reason === "CHECKPOINT_INCONSISTENT" ? "inconsistent" : "absent") as CheckpointStatusLabel,
      boundaryReached: walk.ok ? walk.boundaryReached : false,
      pagesFetched: walk.pagesFetched,
      entriesScanned: walk.entriesScanned,
    };
    if (!walk.ok) {
      log(walk.reason, toSummary(mode, ingest, {
        ...walkMeta,
        rowsExisting: 0,
        rowsWouldInsert: 0,
        formsFound: {},
      }));
      const status = walk.reason === "CHECKPOINT_GAP" || walk.reason === "CHECKPOINT_INCONSISTENT"
        ? 409
        : 502;
      return respondError(status, walk.reason);
    }

    const cikMap = await loadCikMap(secFetch, nowMs);
    if (!(cikMap instanceof Map)) {
      log(cikMap.error, toSummary(mode, ingest, {
        ...walkMeta,
        rowsExisting: 0,
        rowsWouldInsert: 0,
        formsFound: {},
      }));
      return respondError(502, cikMap.error);
    }

    const rows = toCatalystRowsFromSec(walk.entries, cikMap, ingest);
    const formsFound = countIncludedForms(
      walk.entries.map((e) => e.form_type),
      SEC_INCLUDED_FORMS,
    );

    const existing = await deps.store.findExistingDedupeKeys(rows.map((r) => r.dedupe_key));
    if (existing === null) {
      log("DATABASE_ERROR", toSummary(mode, ingest, {
        ...walkMeta,
        rowsExisting: 0,
        rowsWouldInsert: 0,
        formsFound,
      }));
      return respondError(500, "DATABASE_ERROR");
    }
    const { existing: skipped, incoming } = partitionNewRows(rows, existing);
    ingest.rows_skipped_existing += skipped.length;

    if (mode === "dry_run") {
      const safe = toSummary(mode, ingest, {
        ...walkMeta,
        checkpointStatus: anchors === null ? "absent" : walk.checkpointStatus,
        rowsExisting: skipped.length,
        rowsWouldInsert: incoming.length,
        formsFound,
      });
      log("OK", safe);
      return respondJson(200, safe);
    }

    const inserted = incoming.length === 0
      ? 0
      : await deps.store.insertNewRows(incoming as unknown as Record<string, unknown>[]);
    if (inserted === null) {
      log("DATABASE_ERROR", toSummary(mode, ingest, {
        ...walkMeta,
        rowsExisting: skipped.length,
        rowsWouldInsert: incoming.length,
        formsFound,
      }));
      return respondError(500, "DATABASE_ERROR");
    }
    ingest.rows_upserted += inserted;

    const nowIso = new Date(nowMs()).toISOString();
    const saved = await deps.store.saveCheckpoint({
      stream_key: SEC_EDGAR_STREAM_KEY,
      anchor_accessions: walk.page0Accessions,
      anchor_observed_at: nowIso,
      last_success_at: nowIso,
      head_updated_at: walk.page0HeadUpdatedAt,
      pages_fetched: walk.pagesFetched,
    });
    if (!saved) {
      const failed = toSummary(mode, ingest, {
        ...walkMeta,
        checkpointStatus: "write_failed",
        rowsExisting: skipped.length,
        rowsWouldInsert: incoming.length,
        formsFound,
      });
      log("CHECKPOINT_WRITE_FAILED", failed);
      return respondError(500, "CHECKPOINT_WRITE_FAILED");
    }

    const safe = toSummary(mode, ingest, {
      ...walkMeta,
      rowsExisting: skipped.length,
      rowsWouldInsert: incoming.length,
      formsFound,
    });
    log("OK", safe);
    return respondJson(200, safe);
  } catch {
    log("UNKNOWN", toSummary(mode, ingest, {
      checkpointPresent: false,
      checkpointStatus: "absent",
      boundaryReached: false,
      pagesFetched: 0,
      entriesScanned: 0,
      rowsExisting: 0,
      rowsWouldInsert: 0,
      formsFound: {},
    }));
    return respondError(500, "UNKNOWN");
  }
}
