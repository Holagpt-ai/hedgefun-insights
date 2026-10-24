// sync-sec-edgar-filings handler — V1C paging + accession-anchor checkpoint.
// Gate I: single-flight lease, run telemetry, pause/failure counters.
// FACT-ONLY ingestion. Default mode is dry_run. Write requires both
// an authenticated {"mode":"write"} request and SEC_EDGAR_WRITE_ENABLED=true.

import { timingSafeMatch } from "../_shared/timing-safe.ts";
import {
  countIncludedForms,
  isSecEdgarWriteEnabled,
  parseSecSyncRequestBody,
  sanitizeActivationSummary,
  SEC_SYNC_LEASE_TTL_SECONDS,
  SEC_SYNC_MAX_BODY_BYTES,
  SEC_SYNC_MAX_RUN_DURATION_MS,
  shouldSkipSecDiscoveryForMarketHoliday,
  type CheckpointStatusLabel,
  type SecActivationSummary,
  type SecSyncMode,
} from "../_shared/sec-edgar/activation.ts";
import {
  SEC_EDGAR_STREAM_KEY,
  normalizeAnchorAccessions,
  parseLoadedCheckpoint,
  walkLatestFilingsPages,
  type CheckpointSaveRequest,
  type CheckpointSaveResult,
  type LoadCheckpointResult,
} from "../_shared/sec-edgar/checkpoint.ts";
import {
  createSecRequester,
  emptySecSummary,
  parseCompanyTickersExchangeJson,
  partitionSecIngestRows,
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
  SEC_INCLUDED_FORMS,
  SEC_LATEST_FILINGS_PAGE_SIZE,
  toCatalystRowsFromSec,
  type CikTickerMap,
  type SecFetchResult,
  type SecSyncSummary,
} from "../_shared/sec-edgar/ingest.ts";
import {
  buildSecRunRecord,
  logSecRunTelemetry,
  newRunId,
  type SecRunStatus,
} from "../_shared/sec-edgar/run-telemetry.ts";
import type { SecSyncRunOutcome } from "../_shared/sec-edgar/sync-outcome.ts";

export type ReasonCode =
  | "AUTH_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "WRITE_DISABLED"
  | "LEASE_BUSY"
  | "INGESTION_PAUSED"
  | "CHECKPOINT_GAP"
  | "CHECKPOINT_INCONSISTENT"
  | "CHECKPOINT_CONFLICT"
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

export type SecSyncControl = {
  consecutive_failures: number;
  ingestion_paused: boolean;
  failure_pause_threshold: number;
  last_success_at: string | null;
};

export interface SecEdgarStore {
  findExistingDedupeKeys(keys: string[]): Promise<Map<string, string> | null>;
  insertNewRows(rows: Record<string, unknown>[]): Promise<number | null>;
  loadCheckpoint(streamKey: string): Promise<LoadCheckpointResult>;
  saveCheckpoint(request: CheckpointSaveRequest): Promise<CheckpointSaveResult>;
  tryAcquireLease(holderId: string, ttlSeconds: number): Promise<boolean | null>;
  releaseLease(holderId: string): Promise<void>;
  loadSyncControl(): Promise<SecSyncControl | null>;
  recordSyncRun(record: ReturnType<typeof buildSecRunRecord>): Promise<void>;
  noteSyncRunOutcome(success: boolean): Promise<SecSyncRunOutcome | null>;
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
    `[sec-edgar-sync] ${code} mode=${s.mode} run_status=${s.run_status} checkpoint_status=${s.checkpoint_status} pages_fetched=${s.pages_fetched} entries_scanned=${s.entries_scanned} rows_validated=${s.rows_validated} rows_skipped_invalidated=${s.rows_skipped_invalidated} sec_requests=${s.sec_requests} consecutive_failures=${s.consecutive_failures}`,
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
  deadlineMs: number,
): Promise<CikTickerMap | { error: ReasonCode }> {
  const now = nowMs();
  if (now >= deadlineMs) return { error: "PROVIDER_TIMEOUT" };
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
  run: {
    runId: string;
    runStatus: SecRunStatus;
    startedAtMs: number;
    finishedAtMs: number;
    consecutiveFailures: number;
    ingestionPaused: boolean;
    autoPauseApplied: boolean;
    checkpointRevision: number | null;
    lastSuccessAt: string | null;
    providerErrorCode?: string | null;
  },
): SecActivationSummary {
  return sanitizeActivationSummary({
    mode,
    run_id: run.runId,
    run_status: run.runStatus,
    started_at: new Date(run.startedAtMs).toISOString(),
    finished_at: new Date(run.finishedAtMs).toISOString(),
    duration_ms: Math.max(0, run.finishedAtMs - run.startedAtMs),
    consecutive_failures: run.consecutiveFailures,
    ingestion_paused: run.ingestionPaused,
    auto_pause_applied: run.autoPauseApplied,
    checkpoint_revision: run.checkpointRevision,
    last_success_at: run.lastSuccessAt,
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
    rows_skipped_invalidated: ingest.rows_skipped_invalidated,
    rows_rejected: ingest.rows_rejected,
    rows_attribution_unattributed: ingest.rows_attribution_unattributed,
    sec_requests: ingest.sec_requests,
    forms_found: extra.formsFound,
    provider_error_code: run.providerErrorCode ?? null,
  });
}

type RunEmitArgs = {
  mode: SecSyncMode;
  runId: string;
  startedAtMs: number;
  ingest: SecSyncSummary;
  runStatus: SecRunStatus;
  consecutiveFailures: number;
  ingestionPaused: boolean;
  checkpointRevision: number | null;
  lastSuccessAt: string | null;
  errorCode: ReasonCode | "OK" | null;
  providerErrorCode?: string | null;
  extra: Parameters<typeof toSummary>[2];
};

async function emitRun(
  store: SecEdgarStore,
  nowMs: () => number,
  args: RunEmitArgs,
): Promise<SecActivationSummary> {
  const finishedAtMs = nowMs();
  const countsAsFailure = args.runStatus === "error";
  let consecutiveFailures = args.consecutiveFailures;
  let ingestionPaused = args.ingestionPaused;
  let autoPauseApplied = false;
  if (args.runStatus === "ok") {
    const next = await store.noteSyncRunOutcome(true);
    if (next !== null) {
      consecutiveFailures = next.consecutive_failures;
      ingestionPaused = next.ingestion_paused;
      autoPauseApplied = next.auto_pause_applied;
    }
  } else if (countsAsFailure) {
    const next = await store.noteSyncRunOutcome(false);
    if (next !== null) {
      consecutiveFailures = next.consecutive_failures;
      ingestionPaused = next.ingestion_paused;
      autoPauseApplied = next.auto_pause_applied;
    }
  }

  const summary = toSummary(args.mode, args.ingest, args.extra, {
    runId: args.runId,
    runStatus: args.runStatus,
    startedAtMs: args.startedAtMs,
    finishedAtMs,
    consecutiveFailures,
    ingestionPaused,
    autoPauseApplied,
    checkpointRevision: args.checkpointRevision,
    lastSuccessAt: args.lastSuccessAt,
    providerErrorCode: args.providerErrorCode,
  });

  if (autoPauseApplied) {
    console.log(JSON.stringify({
      event: "sec_edgar_sync_auto_pause",
      run_id: args.runId,
      consecutive_failures: consecutiveFailures,
    }));
  }

  const record = buildSecRunRecord({
    runId: args.runId,
    streamKey: SEC_EDGAR_STREAM_KEY,
    mode: args.mode,
    status: args.runStatus,
    startedAtMs: args.startedAtMs,
    finishedAtMs,
    errorCode: args.errorCode === "OK" ? null : args.errorCode,
    summary,
  });
  logSecRunTelemetry(record);
  await store.recordSyncRun(record);
  log(args.errorCode ?? "OK", summary);
  return summary;
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

  const runId = newRunId();
  const nowMs = deps.nowMs ?? (() => Date.now());
  const startedAtMs = nowMs();
  const deadlineMs = startedAtMs + SEC_SYNC_MAX_RUN_DURATION_MS;
  const ingest = emptySecSummary();
  const secFetch = createSecRequester(secUserAgent.trim(), ingest, {
    fetchFn: deps.fetchFn,
  });

  let leaseHeld = false;
  const runCtx = {
    consecutiveFailures: 0,
    ingestionPaused: false,
    checkpointRevision: null as number | null,
    lastSuccessAt: null as string | null,
  };
  const emitBase = (): Pick<
    RunEmitArgs,
    "consecutiveFailures" | "ingestionPaused" | "checkpointRevision" | "lastSuccessAt"
  > => ({
    consecutiveFailures: runCtx.consecutiveFailures,
    ingestionPaused: runCtx.ingestionPaused,
    checkpointRevision: runCtx.checkpointRevision,
    lastSuccessAt: runCtx.lastSuccessAt,
  });

  const emptyExtra = {
    checkpointPresent: false,
    checkpointStatus: "absent" as CheckpointStatusLabel,
    boundaryReached: false,
    pagesFetched: 0,
    entriesScanned: 0,
    rowsExisting: 0,
    rowsWouldInsert: 0,
    formsFound: {} as Record<string, number>,
  };

  try {
    const control = await deps.store.loadSyncControl();
    if (control === null) {
      log("DATABASE_ERROR");
      return respondError(500, "DATABASE_ERROR");
    }
    runCtx.consecutiveFailures = control.consecutive_failures;
    runCtx.ingestionPaused = control.ingestion_paused;
    runCtx.lastSuccessAt = control.last_success_at;

    if (mode === "write" && control.ingestion_paused) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "paused",
        ...emitBase(),
        errorCode: "INGESTION_PAUSED",
        extra: emptyExtra,
      });
      return respondError(409, "INGESTION_PAUSED");
    }

    const leased = await deps.store.tryAcquireLease(runId, SEC_SYNC_LEASE_TTL_SECONDS);
    if (leased === null) {
      log("DATABASE_ERROR");
      return respondError(500, "DATABASE_ERROR");
    }
    if (!leased) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "lease_busy",
        ...emitBase(),
        errorCode: "LEASE_BUSY",
        extra: emptyExtra,
      });
      return respondError(409, "LEASE_BUSY");
    }
    leaseHeld = true;

    const loaded = await deps.store.loadCheckpoint(SEC_EDGAR_STREAM_KEY);
    if (!loaded.ok) {
      const loadReason = loaded.reason === "CHECKPOINT_INCONSISTENT"
        ? "CHECKPOINT_INCONSISTENT"
        : "DATABASE_ERROR";
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: loadReason,
        extra: {
          ...emptyExtra,
          checkpointStatus: loadReason === "CHECKPOINT_INCONSISTENT" ? "inconsistent" : "absent",
        },
      });
      return respondError(loadReason === "CHECKPOINT_INCONSISTENT" ? 409 : 500, loadReason);
    }

    let anchors: string[] | null = null;
    let expectedRevision: number | null = null;
    if (loaded.checkpoint) {
      const parsed = parseLoadedCheckpoint(loaded.checkpoint);
      if (!parsed.ok) {
        await emitRun(deps.store, nowMs, {
          mode,
          runId,
          startedAtMs,
          ingest,
          runStatus: "error",
          ...emitBase(),
          errorCode: "CHECKPOINT_INCONSISTENT",
          extra: { ...emptyExtra, checkpointStatus: "inconsistent" },
        });
        return respondError(409, "CHECKPOINT_INCONSISTENT");
      }
      anchors = parsed.checkpoint.anchor_accessions;
      expectedRevision = parsed.checkpoint.revision;
      runCtx.checkpointRevision = expectedRevision;
      runCtx.lastSuccessAt = parsed.checkpoint.last_success_at ?? runCtx.lastSuccessAt;
    }

    if (nowMs() >= deadlineMs) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: "PROVIDER_TIMEOUT",
        providerErrorCode: "PROVIDER_TIMEOUT",
        extra: {
          ...emptyExtra,
          checkpointPresent: anchors !== null,
        },
      });
      return respondError(504, "PROVIDER_TIMEOUT");
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
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: walk.reason,
        providerErrorCode: walk.reason.startsWith("PROVIDER_") ? walk.reason : null,
        extra: { ...walkMeta, rowsExisting: 0, rowsWouldInsert: 0, formsFound: {} },
      });
      const status = walk.reason === "CHECKPOINT_GAP" || walk.reason === "CHECKPOINT_INCONSISTENT"
        ? 409
        : 502;
      return respondError(status, walk.reason);
    }

    const nextAnchors = normalizeAnchorAccessions(walk.page0Accessions);
    if (nextAnchors === null) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: "CHECKPOINT_INCONSISTENT",
        extra: {
          ...walkMeta,
          checkpointStatus: "inconsistent",
          rowsExisting: 0,
          rowsWouldInsert: 0,
          formsFound: {},
        },
      });
      return respondError(409, "CHECKPOINT_INCONSISTENT");
    }

    const cikMap = await loadCikMap(secFetch, nowMs, deadlineMs);
    if (!(cikMap instanceof Map)) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: cikMap.error,
        providerErrorCode: cikMap.error.startsWith("PROVIDER_") ? cikMap.error : null,
        extra: { ...walkMeta, rowsExisting: 0, rowsWouldInsert: 0, formsFound: {} },
      });
      return respondError(502, cikMap.error);
    }

    const rows = toCatalystRowsFromSec(walk.entries, cikMap, ingest);
    const formsFound = countIncludedForms(
      walk.entries.map((e) => e.form_type),
      SEC_INCLUDED_FORMS,
    );

    const existingByKey = await deps.store.findExistingDedupeKeys(rows.map((r) => r.dedupe_key));
    if (existingByKey === null) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: "DATABASE_ERROR",
        extra: { ...walkMeta, rowsExisting: 0, rowsWouldInsert: 0, formsFound },
      });
      return respondError(500, "DATABASE_ERROR");
    }
    const { existing: skipped, incoming, skippedInvalidated } = partitionSecIngestRows(
      rows,
      existingByKey,
    );
    ingest.rows_skipped_existing += skipped.length;
    ingest.rows_skipped_invalidated += skippedInvalidated;

    if (mode === "dry_run") {
      const safe = await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "ok",
        ...emitBase(),
        errorCode: "OK",
        extra: {
          ...walkMeta,
          checkpointStatus: anchors === null ? "absent" : walk.checkpointStatus,
          rowsExisting: skipped.length,
          rowsWouldInsert: incoming.length,
          formsFound,
        },
      });
      return respondJson(200, safe);
    }

    const inserted = incoming.length === 0
      ? 0
      : await deps.store.insertNewRows(incoming as unknown as Record<string, unknown>[]);
    if (inserted === null) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: "DATABASE_ERROR",
        extra: {
          ...walkMeta,
          rowsExisting: skipped.length,
          rowsWouldInsert: incoming.length,
          formsFound,
        },
      });
      return respondError(500, "DATABASE_ERROR");
    }
    ingest.rows_upserted += inserted;

    const nowIso = new Date(nowMs()).toISOString();
    const saved = await deps.store.saveCheckpoint({
      expectedRevision,
      nextCheckpoint: {
        stream_key: SEC_EDGAR_STREAM_KEY,
        anchor_accessions: nextAnchors,
        revision: expectedRevision === null ? 0 : expectedRevision + 1,
        anchor_observed_at: nowIso,
        last_success_at: nowIso,
        head_updated_at: walk.page0HeadUpdatedAt,
        pages_fetched: walk.pagesFetched,
      },
    });
    if (!saved.ok) {
      await emitRun(deps.store, nowMs, {
        mode,
        runId,
        startedAtMs,
        ingest,
        runStatus: "error",
        ...emitBase(),
        errorCode: saved.reason,
        extra: {
          ...walkMeta,
          checkpointStatus: saved.reason === "CHECKPOINT_CONFLICT" ? "conflict" : "write_failed",
          rowsExisting: skipped.length,
          rowsWouldInsert: incoming.length,
          formsFound,
        },
      });
      return respondError(
        saved.reason === "CHECKPOINT_CONFLICT" ? 409 : 500,
        saved.reason,
      );
    }

    runCtx.checkpointRevision = expectedRevision === null ? 0 : expectedRevision + 1;
    runCtx.lastSuccessAt = nowIso;

    const safe = await emitRun(deps.store, nowMs, {
      mode,
      runId,
      startedAtMs,
      ingest,
      runStatus: "ok",
      ...emitBase(),
      errorCode: "OK",
      extra: {
        ...walkMeta,
        rowsExisting: skipped.length,
        rowsWouldInsert: incoming.length,
        formsFound,
      },
    });
    return respondJson(200, safe);
  } catch {
    await emitRun(deps.store, nowMs, {
      mode,
      runId,
      startedAtMs,
      ingest,
      runStatus: "error",
      ...emitBase(),
      errorCode: "UNKNOWN",
      extra: emptyExtra,
    }).catch(() => undefined);
    return respondError(500, "UNKNOWN");
  } finally {
    if (leaseHeld) {
      await deps.store.releaseLease(runId).catch(() => undefined);
    }
  }
}
