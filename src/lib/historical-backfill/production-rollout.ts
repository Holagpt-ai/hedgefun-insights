import {
  HISTORICAL_CATCHUP_TARGET_ENV,
  HISTORICAL_ROLLOUT_ANCHOR_SESSION,
  effectiveEligibilityBatchSize,
  readHistoricalCatchupEligibilityBatchSizeFromEnv,
  readHistoricalCatchupLimitsFromEnv,
  readHistoricalCatchupResumeOnlyFromEnv,
  type HistoricalCatchupLimits,
} from "@/config/historical-catchup.config";
import {
  catchUpRolloutEventName,
  resolveCatchUpRolloutOutcome,
  type CatchUpStopReason,
} from "@/lib/historical-backfill/catch-up-rollout-outcome";
import {
  isProviderBudgetExhausted,
  ProviderRequestBudget,
} from "@/lib/historical-backfill/provider-request-budget";
import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import { readHistoricalEntitlementConfigFromEnv } from "@/config/historical-entitlement.config";
import { validateProviderEntitlementFloor } from "@/lib/historical-backfill/entitlement-floor-validation";
import { symbolCoverageCurrentThroughTarget } from "@/lib/historical-backfill/catch-up-eligibility";
import {
  resolveProviderStartDate,
  validateHistoricalCatchUpTargetSession,
} from "@/lib/historical-backfill/production-target-date";
import { historicalBackfillConfig } from "@/config/historical-backfill.config";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { createPolygonDailyAdapter } from "@/lib/historical-backfill/polygon-daily-adapter";
import { loadDotEnvFiles } from "@/lib/persistence/production-database";
import {
  createHistoricalPersistence,
  type HistoricalIdentityRepository,
  type HistoricalPersistence,
} from "@/lib/persistence/historical-persistence";
import { HistoricalBridgeClient, requireHistoricalBridgeConfig } from "@/lib/persistence/historical-bridge-client";
import { HistoricalFactConflictError } from "@/lib/security-intelligence/postgres-security-intelligence";
import type { SecurityType } from "@/config/security-identity.config";
import type { BackfillJobStats } from "@/types/historical-backfill";
import type { SecurityId } from "@/types/security-identity";
import type { SecurityBackfillJob } from "@/types/security-intelligence";

export const PRODUCTION_CANARY_SYMBOLS = new Set([
  "INTC", "OGN", "NWL", "AMD", "APA", "ALK", "AOS", "BEN", "BBY", "FMC",
]);
export const PRODUCTION_DATE_FROM = HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE;
/** @deprecated Use validated catch-up target — kept for tests referencing the Sep 2026 pilot. */
export const PRODUCTION_DATE_TO = HISTORICAL_ROLLOUT_ANCHOR_SESSION;
const FULL_SPAN_DAYS = 2000;
const SUBSEQUENT_ELIGIBILITY_BATCH_SIZE = 500;

/** Exported for tests — symbols selected from the head of the eligible list per batch. */
export function resolveEligibilityTrancheSize(input: {
  batchesRun: number;
  eligibilityBatchSize: number;
  limits: HistoricalCatchupLimits;
  symbolsAttempted: number;
}): number {
  const remainingSymbolBudget = input.limits.maxSymbolsPerRun - input.symbolsAttempted;
  const tranche = input.batchesRun === 0
    ? effectiveEligibilityBatchSize(input.eligibilityBatchSize, input.limits.maxSymbolsPerRun)
    : SUBSEQUENT_ELIGIBILITY_BATCH_SIZE;
  return Math.min(tranche, remainingSymbolBudget);
}

export function resolveHistoricalCatchUpTargetSession(input: {
  envValue?: string | null;
  explicitTarget?: string | null;
  now?: Date;
}): { ok: true; targetSession: string; completedSession: string } | { ok: false; error: string } {
  const raw = input.explicitTarget?.trim() || input.envValue?.trim() || "";
  const validated = validateHistoricalCatchUpTargetSession({
    raw,
    now: input.now ?? new Date(),
  });
  if (validated.ok === false) {
    return { ok: false, error: `${validated.reason}: ${validated.detail}` };
  }
  return validated;
}

interface ProviderCounters {
  dailyRequests: number;
  referenceRequests: number;
  http403: number;
  http429: number;
  nextPages: number;
}

interface RequestLog {
  kind: "reference" | "events" | "daily" | "daily_page";
  http: number;
  next: boolean;
}

function requirePolygonKey(): string {
  const key = process.env.POLYGON_API_KEY?.trim() ?? "";
  if (!key) throw new Error("POLYGON_API_KEY is required");
  return key;
}

function logEvent(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

export type IdentityResolutionStage = "initial_resolve" | "ticker_change";

export class IdentityResolutionPersistenceError extends Error {
  readonly stage: IdentityResolutionStage;
  readonly symbol: string;
  readonly cause: unknown;

  constructor(cause: unknown, meta: { stage: IdentityResolutionStage; symbol: string }) {
    super(cause instanceof Error ? cause.message : "identity persistence failed");
    this.name = "IdentityResolutionPersistenceError";
    this.stage = meta.stage;
    this.symbol = meta.symbol;
    this.cause = cause;
  }
}

export function sanitizeIdentityPersistenceError(error: unknown): {
  errorCode: string | null;
  constraintName: string | null;
  errorMessage: string;
} {
  const raw = error instanceof Error ? error.message : String(error);
  let errorCode: string | null = null;
  let constraintName: string | null = null;
  if (error && typeof error === "object") {
    const row = error as Record<string, unknown>;
    if (typeof row.code === "string") errorCode = row.code;
    if (typeof row.constraint === "string") constraintName = row.constraint;
  }
  const constraintMatch = /constraint "([^"]+)"/i.exec(raw);
  if (!constraintName && constraintMatch) constraintName = constraintMatch[1];
  const errorMessage = raw
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/apikey=[^&\s]+/gi, "apikey=[redacted]")
    .slice(0, 500);
  return { errorCode, constraintName, errorMessage };
}

function logIdentityResolutionFailure(input: {
  symbol: string;
  symbolIndex: number;
  symbolsAttempted: number;
  targetSession: string;
  stage: IdentityResolutionStage;
  providerRequestsUsed: number;
  providerRequestsMax: number;
  backfillJobCreated: boolean;
  error: unknown;
}): void {
  const sanitized = sanitizeIdentityPersistenceError(
    input.error instanceof IdentityResolutionPersistenceError ? input.error.cause : input.error,
  );
  logEvent({
    event: "catch_up_identity_resolution_failed",
    symbol: input.symbol,
    symbolIndex: input.symbolIndex,
    symbolsAttempted: input.symbolsAttempted,
    targetSession: input.targetSession,
    identityResolutionStage: input.stage,
    providerRequestsUsed: input.providerRequestsUsed,
    providerRequestsMax: input.providerRequestsMax,
    backfillJobCreated: input.backfillJobCreated,
    errorCode: sanitized.errorCode,
    constraintName: sanitized.constraintName,
    errorMessage: sanitized.errorMessage,
  });
}

interface PolygonHttpResponse {
  httpStatus: number;
  body: Record<string, unknown>;
}

async function polygon(
  budget: ProviderRequestBudget,
  counters: ProviderCounters,
  logs: RequestLog[],
  kind: RequestLog["kind"],
  path: string,
  params: Record<string, string>,
  key: string,
): Promise<PolygonHttpResponse> {
  budget.consumeBeforeRequest();
  const url = new URL(`https://api.polygon.io${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("apiKey", key);
  const response = await fetch(url);
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  const next = typeof json?.next_url === "string" && json.next_url.length > 0;
  logs.push({ kind, http: response.status, next });
  if (kind === "daily" || kind === "daily_page") counters.dailyRequests += 1;
  else counters.referenceRequests += 1;
  if (response.status === 403) counters.http403 += 1;
  if (response.status === 429) counters.http429 += 1;
  if (next) counters.nextPages += 1;
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`provider ${kind} HTTP ${response.status}`);
  }
  return { httpStatus: response.status, body: json ?? {} };
}

function securityType(value: unknown): SecurityType {
  const type = typeof value === "string" ? value.toUpperCase() : "";
  if (type === "CS") return "COMMON_STOCK";
  if (type === "ETF") return "ETF";
  if (type.includes("ADR")) return "ADR";
  if (type.includes("PFD") || type === "PF") return "PREFERRED";
  if (type.includes("WARRANT")) return "WARRANT";
  return "UNKNOWN";
}

function tickerChanges(payload: Record<string, unknown>): Array<{ date: string; ticker: string }> {
  const results = payload.results;
  const events = results && typeof results === "object" && Array.isArray((results as { events?: unknown }).events)
    ? (results as { events: Array<Record<string, unknown>> }).events
    : [];
  const changes: Array<{ date: string; ticker: string }> = [];
  for (const event of events) {
    if (event.type !== "ticker_change") continue;
    const nested = event.ticker_change;
    const ticker = nested && typeof nested === "object" && typeof (nested as { ticker?: unknown }).ticker === "string"
      ? (nested as { ticker: string }).ticker
      : null;
    const date = typeof event.date === "string" ? event.date.slice(0, 10) : null;
    if (ticker && date) changes.push({ date, ticker: ticker.toUpperCase() });
  }
  return changes.sort((a, b) => a.date.localeCompare(b.date));
}

async function resolveSymbol(
  symbol: string,
  key: string,
  identity: HistoricalIdentityRepository,
  recordedAt: string,
  budget: ProviderRequestBudget,
  counters: ProviderCounters,
  logs: RequestLog[],
  rolloutDateTo: string,
): Promise<SecurityId | null> {
  const detailsRes = await polygon(budget, counters, logs, "reference", `/v3/reference/tickers/${symbol}`, {}, key);
  const eventsRes = await polygon(budget, counters, logs, "events", `/vX/reference/tickers/${symbol}/events`, {}, key);
  const details = detailsRes.body;
  const events = eventsRes.body;
  const row = details.results && typeof details.results === "object" ? details.results as Record<string, unknown> : null;
  if (!row || details.status === "NOT_FOUND" || row.ticker == null) return null;
  const listDate = typeof row.list_date === "string" ? row.list_date.slice(0, 10) : null;
  const listYear = listDate ? Number(listDate.slice(0, 4)) : NaN;
  const usableListDate = listDate !== null && listYear >= 1970 && listYear <= 2100 ? listDate : null;
  const effectiveDate = usableListDate && usableListDate <= PRODUCTION_DATE_FROM ? usableListDate : PRODUCTION_DATE_FROM;
  const inWindowChanges = tickerChanges(events).filter((change) =>
    change.date > PRODUCTION_DATE_FROM && change.date <= rolloutDateTo,
  );
  const locale = typeof row.locale === "string" ? row.locale.toUpperCase() : null;
  let resolved;
  try {
    resolved = await identity.resolve({
      symbol,
      exchange: typeof row.primary_exchange === "string" ? row.primary_exchange : null,
      effectiveDate,
      issuerName: typeof row.name === "string" ? row.name : null,
      securityType: securityType(row.type),
      country: locale === "US" ? "US" : locale && /^[A-Z]{2}$/.test(locale) ? locale : null,
      adrStatus: securityType(row.type) === "ADR" ? "ADR" : "NOT_ADR",
      compositeFigi: typeof row.composite_figi === "string" ? row.composite_figi : null,
      figi: typeof row.share_class_figi === "string" ? row.share_class_figi : null,
      cik: typeof row.cik === "string" ? row.cik : null,
      source: "polygon-reference",
      provenance: "PROVIDER",
      recordedAt,
    });
  } catch (error) {
    throw new IdentityResolutionPersistenceError(error, { stage: "initial_resolve", symbol });
  }
  if (resolved.status !== "RESOLVED" || !resolved.securityId) return null;
  for (const change of inWindowChanges) {
    if (change.ticker === symbol) continue;
    try {
      await identity.resolve({
        symbol: change.ticker,
        exchange: typeof row.primary_exchange === "string" ? row.primary_exchange : null,
        effectiveDate: change.date,
        compositeFigi: typeof row.composite_figi === "string" ? row.composite_figi : null,
        source: "polygon-reference-events",
        provenance: "PROVIDER",
        recordedAt,
      });
    } catch (error) {
      throw new IdentityResolutionPersistenceError(error, { stage: "ticker_change", symbol: change.ticker });
    }
  }
  return resolved.securityId;
}

async function validateEntitlementConfigForRollout(
  key: string,
  budget: ProviderRequestBudget,
  counters: ProviderCounters,
  logs: RequestLog[],
): Promise<string | null> {
  const entitlement = readHistoricalEntitlementConfigFromEnv();
  if (!entitlement.floorDate) return null;
  await validateProviderEntitlementFloor(entitlement, async (symbol, sessionDate) => {
    const res = await polygon(
      budget,
      counters,
      logs,
      "daily",
      `/v2/aggs/ticker/${symbol}/range/1/day/${sessionDate}/${sessionDate}`,
      { adjusted: "true", sort: "asc", limit: "50000" },
      key,
    );
    return {
      httpStatus: res.httpStatus,
      providerStatus: typeof res.body.status === "string" ? res.body.status : null,
      providerMessage: typeof res.body.message === "string" ? res.body.message : null,
    };
  });
  return entitlement.floorDate;
}

function createEngine(
  persistence: HistoricalPersistence,
  key: string,
  budget: ProviderRequestBudget,
  counters: ProviderCounters,
  logs: RequestLog[],
  providerEntitlementFloor: string | null,
) {
  const { identity, intelligence } = persistence;
  const config = historicalBackfillConfig({
    dateChunkDays: FULL_SPAN_DAYS,
    maxChunksPerRun: 5,
    maxConcurrentProviderRequests: 1,
    retryCount: 2,
    retryBackoffMs: 400,
    verifiedEarliestDailyDate: PRODUCTION_DATE_FROM,
    providerEntitlementFloor,
  });
  const adapter = createPolygonDailyAdapter({
    verifiedEarliestDailyDate: PRODUCTION_DATE_FROM,
    fetchAggregates: async (ticker, multiplier, timespan, from, to) => {
      if (timespan !== "day" || multiplier !== 1) throw new Error("refused non-daily aggregate request");
      if (from < PRODUCTION_DATE_FROM) throw new Error("refused daily request before entitlement");
      const res = await polygon(budget, counters, logs, "daily", `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
        adjusted: "true",
        sort: "asc",
        limit: "50000",
      }, key);
      return { httpStatus: res.httpStatus, body: res.body };
    },
    fetchNextPage: async (nextUrl) => {
      budget.consumeBeforeRequest();
      const url = new URL(nextUrl);
      if (!url.searchParams.get("apiKey")) url.searchParams.set("apiKey", key);
      const response = await fetch(url);
      const json = await response.json() as Record<string, unknown>;
      logs.push({
        kind: "daily_page",
        http: response.status,
        next: typeof json.next_url === "string",
      });
      counters.dailyRequests += 1;
      if (response.status === 403) counters.http403 += 1;
      if (response.status === 429) counters.http429 += 1;
      if (typeof json.next_url === "string") counters.nextPages += 1;
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`provider daily_page HTTP ${response.status}`);
      }
      return { httpStatus: response.status, body: json };
    },
  });
  return new HistoricalBackfillEngine({
    identity,
    intelligence,
    provider: adapter,
    config,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}

function episodesWritten(stats: BackfillJobStats): number {
  return stats.episodesByTier.NOTABLE + stats.episodesByTier.SIGNIFICANT + stats.episodesByTier.EXTREME;
}

export interface ResumeInterruptedJobsResult {
  /** When true, do not start new catch-up batches in this Fly process. */
  blockNewJobs: boolean;
  stopReason: CatchUpStopReason;
  interruptedJobId: string | null;
}

export async function resumeInterruptedJobById(
  engine: HistoricalBackfillEngine,
  persistence: HistoricalPersistence,
  jobId: string,
  limits: HistoricalCatchupLimits,
  counters: ProviderCounters,
  budget: ProviderRequestBudget,
): Promise<ResumeInterruptedJobsResult & { stats: BackfillJobStats }> {
  const job = await persistence.intelligence.getJob(jobId);
  if (!job) {
    throw new Error(`interrupted job ${jobId} not found`);
  }
  const started = Date.now();
  if (job.state === "PAUSED" || job.state === "FAILED") {
    const resumed = await engine.resume(jobId, new Date().toISOString());
    if (!resumed.ok) throw new Error(`resume blocked: ${resumed.reason}`);
  } else if (job.state !== "RUNNING") {
    throw new Error(`interrupted job ${jobId} is not resumable (state=${job.state})`);
  }
  const stats = await advanceJobWithinFlyLimits(engine, jobId, limits, counters, budget);
  logEvent({
    event: "batch_complete",
    jobId,
    resumed: job.state !== "RUNNING",
    state: stats.state,
    securitiesProcessed: stats.securitiesProcessed,
    rowsWritten: stats.rowsWritten,
    episodesWritten: episodesWritten(stats),
    providerErrors: stats.providerErrors,
    elapsedMs: Date.now() - started,
  });
  if (stats.state === "FAILED") {
    throw new Error(`interrupted job ${jobId} failed`);
  }
  if (stats.state === "PAUSED") {
    return {
      blockNewJobs: true,
      stopReason: "job_paused",
      interruptedJobId: jobId,
      stats,
    };
  }
  if (stats.state === "RUNNING") {
    const budgetExhausted = budget.used >= limits.maxProviderRequestsPerRun;
    return {
      blockNewJobs: true,
      stopReason: budgetExhausted || providerRequestTotal(counters) >= limits.maxProviderRequestsPerRun
        ? "provider_request_limit"
        : "interrupted_job_incomplete",
      interruptedJobId: jobId,
      stats,
    };
  }
  return { blockNewJobs: false, stopReason: "none", interruptedJobId: null, stats };
}

export async function resumeInterruptedJobs(
  engine: HistoricalBackfillEngine,
  persistence: HistoricalPersistence,
  dateFrom: string,
  dateTo: string,
  limits: HistoricalCatchupLimits,
  counters: ProviderCounters,
  budget: ProviderRequestBudget,
): Promise<ResumeInterruptedJobsResult> {
  const interrupted = await persistence.rollout.findInterruptedJob(dateFrom, dateTo);
  if (!interrupted) {
    return { blockNewJobs: false, stopReason: "none", interruptedJobId: null };
  }
  const result = await resumeInterruptedJobById(
    engine,
    persistence,
    interrupted.jobId,
    limits,
    counters,
    budget,
  );
  return {
    blockNewJobs: result.blockNewJobs,
    stopReason: result.stopReason,
    interruptedJobId: result.interruptedJobId,
  };
}

export interface ProductionRolloutResult {
  batchesRun: number;
  symbolsAttempted: number;
  symbolsResolved: number;
  symbolsSkipped: number;
  provider: ProviderCounters;
  runtimeMs: number;
  outcome: "complete" | "partial";
  stopReason: CatchUpStopReason;
  eligibleSymbolsRemaining: number;
}

export const PRODUCTION_CONNECTIVITY_JOB_ID = "0ab000ee-6f58-4e21-ba68-4a095a97f584";

export async function runHistoricalBackfillConnectivityCheck(options: {
  loadLocalEnv?: boolean;
  jobId?: string;
  persistenceOverride?: HistoricalPersistence;
} = {}): Promise<{ transport: string; jobId: string; jobState: string | null }> {
  const persistence = createHistoricalPersistence({
    loadLocalEnv: options.loadLocalEnv,
    persistenceOverride: options.persistenceOverride,
  });
  const jobId = options.jobId ?? PRODUCTION_CONNECTIVITY_JOB_ID;
  try {
    const job = await persistence.intelligence.getJob(jobId);
    if (!job) throw new Error(`connectivity check: job ${jobId} not found`);
    if (persistence.transport === "bridge") {
      const bridge = new HistoricalBridgeClient(requireHistoricalBridgeConfig());
      await bridge.call("historical_apply_daily_batch", { p_rows: [] });
      const interrupted = await persistence.rollout.findInterruptedJob(job.dateFrom, job.dateTo);
      if (!interrupted?.jobId) throw new Error("connectivity check: rollout job query failed");
    }
    if (job.state === "RUNNING") {
      const checkpoint = await persistence.intelligence.recordBackfillCheckpoint(jobId, {
        to: "RUNNING",
        recordedAt: job.updatedAt,
        cursorDate: job.cursorDate,
        cursorToken: job.cursorToken,
        processedCount: job.processedCount,
        errorCount: job.errorCount,
        metadata: job.metadata,
      });
      if (!checkpoint.ok) throw new Error(`connectivity checkpoint blocked: ${checkpoint.reason}`);
    } else if (job.state === "PAUSED" || job.state === "FAILED") {
      const counters: ProviderCounters = {
        dailyRequests: 0,
        referenceRequests: 0,
        http403: 0,
        http429: 0,
        nextPages: 0,
      };
      const engine = createEngine(
        persistence,
        requirePolygonKey(),
        new ProviderRequestBudget(1),
        counters,
        [],
        null,
      );
      const resumed = await engine.resume(jobId, new Date().toISOString());
      if (!resumed.ok) throw new Error(`connectivity resume blocked: ${resumed.reason}`);
      const restored = await persistence.intelligence.transitionBackfillJob(jobId, {
        to: job.state,
        recordedAt: job.updatedAt,
        cursorDate: job.cursorDate,
        cursorToken: job.cursorToken,
        processedCount: job.processedCount,
        errorCount: job.errorCount,
        metadata: job.metadata,
      });
      if (!restored.ok) throw new Error(`connectivity restore blocked: ${restored.reason}`);
    }
    return { transport: persistence.transport, jobId, jobState: job.state };
  } finally {
    await persistence.close();
  }
}

function providerRequestTotal(counters: ProviderCounters): number {
  return counters.dailyRequests + counters.referenceRequests;
}

async function loadCatchUpCompleteSymbols(
  persistence: HistoricalPersistence,
  dateFrom: string,
  targetSession: string,
): Promise<Set<string>> {
  const coverage = await persistence.rollout.loadSymbolSessionCoverage(dateFrom, targetSession);
  return new Set(
    coverage
      .filter((row) => symbolCoverageCurrentThroughTarget(row, targetSession))
      .map((row) => row.symbol),
  );
}

async function buildProviderStarts(
  intelligence: HistoricalPersistence["intelligence"],
  securityIds: readonly SecurityId[],
  globalDateFrom: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const securityId of securityIds) {
    const rows = await intelligence.listDailyHistory(securityId);
    let latest: string | null = null;
    for (const row of rows) {
      if (!latest || row.sessionDate > latest) latest = row.sessionDate;
    }
    out[securityId] = resolveProviderStartDate({
      globalDateFrom,
      latestStoredSession: latest,
    });
  }
  return out;
}

async function advanceJobWithinFlyLimits(
  engine: HistoricalBackfillEngine,
  jobId: string,
  limits: HistoricalCatchupLimits,
  counters: ProviderCounters,
  budget: ProviderRequestBudget,
): Promise<BackfillJobStats> {
  const recordedAt = new Date().toISOString();
  let stats = await engine.stats(jobId, recordedAt);
  while (
    stats.state === "RUNNING"
    && budget.remaining > 0
    && providerRequestTotal(counters) < limits.maxProviderRequestsPerRun
  ) {
    try {
      stats = await engine.runBatch(jobId, new Date().toISOString());
    } catch (error) {
      if (error instanceof HistoricalFactConflictError) {
        throw new Error(`historical fact conflict: ${error.message}`);
      }
      throw error;
    }
    if (stats.state === "PAUSED" || stats.state === "FAILED") break;
  }
  return stats;
}

export type ResumeOnlyTerminalEvent =
  | "resume_only_complete"
  | "resume_only_paused"
  | "resume_only_failed"
  | "resume_only_noop";

export type ResumeOnlyRefusalReason =
  | "job_missing"
  | "already_complete"
  | "date_range_mismatch"
  | "not_resumable";

export interface ResumeOnlyRunMetrics {
  cursorToken: string | null;
  processedCount: number;
  rowsWritten: number;
  episodesWritten: number;
  coverageGapsRecorded: number | null;
}

export interface HistoricalCatchUpResumeOnlyResult {
  terminalEvent: ResumeOnlyTerminalEvent;
  jobId: string;
  startingCursor: string | null;
  endingCursor: string | null;
  finalJobState: string;
  securitiesProcessedDuringRun: number;
  dailyRowsWrittenDuringRun: number;
  episodesWrittenDuringRun: number;
  coverageGapsRecordedDuringRun: number | null;
  providerDailyRequests: number;
  providerReferenceRequests: number;
  stopReason: CatchUpStopReason | ResumeOnlyRefusalReason | "none";
  eligibilityJobCreated: false;
  runtimeMs: number;
}

export interface HistoricalCatchUpRolloutOptions {
  loadLocalEnv?: boolean;
  /** Explicit target session (tests). Otherwise HISTORICAL_CATCHUP_TARGET_SESSION is required. */
  targetSession?: string | null;
  now?: Date;
  limits?: HistoricalCatchupLimits;
  /** Test hook — bypass bridge/postgres wiring. */
  persistenceOverride?: HistoricalPersistence;
  /** Test hook — explicit resume job id (overrides env when resume-only). */
  resumeJobId?: string | null;
  /** Test hook — bypass Polygon adapter wiring. */
  engineOverride?: HistoricalBackfillEngine;
}

/** Validates target date and limits without historical writes or provider catch-up. */
export async function runHistoricalCatchUpPreflight(
  options: HistoricalCatchUpRolloutOptions = {},
): Promise<{
  targetSession: string;
  completedSession: string;
  limits: HistoricalCatchupLimits;
  eligibilityBatchSize: number;
}> {
  if (options.loadLocalEnv) loadDotEnvFiles();
  const targetResolved = resolveHistoricalCatchUpTargetSession({
    envValue: process.env[HISTORICAL_CATCHUP_TARGET_ENV],
    explicitTarget: options.targetSession,
    now: options.now,
  });
  if (targetResolved.ok === false) {
    throw new Error(targetResolved.error);
  }
  const limits = options.limits ?? readHistoricalCatchupLimitsFromEnv();
  const eligibilityBatchSize = readHistoricalCatchupEligibilityBatchSizeFromEnv();
  const entitlement = readHistoricalEntitlementConfigFromEnv();
  if (entitlement.floorDate) {
    const key = requirePolygonKey();
    const counters: ProviderCounters = {
      dailyRequests: 0,
      referenceRequests: 0,
      http403: 0,
      http429: 0,
      nextPages: 0,
    };
    await validateEntitlementConfigForRollout(
      key,
      new ProviderRequestBudget(4),
      counters,
      [],
    );
  }
  logEvent({
    event: "catch_up_preflight_ok",
    targetSession: targetResolved.targetSession,
    completedSession: targetResolved.completedSession,
    limits,
    eligibilityBatchSize,
    effectiveEligibilityBatchSize: effectiveEligibilityBatchSize(
      eligibilityBatchSize,
      limits.maxSymbolsPerRun,
    ),
    entitlementFloor: entitlement.floorDate,
  });
  return {
    targetSession: targetResolved.targetSession,
    completedSession: targetResolved.completedSession,
    limits,
    eligibilityBatchSize,
  };
}

function episodesFromJobMetadata(job: SecurityBackfillJob): number {
  const checkpoint = job.metadata?.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") return 0;
  const tiers = (checkpoint as { episodesByTier?: Record<string, number> }).episodesByTier;
  if (!tiers) return 0;
  return (tiers.NOTABLE ?? 0) + (tiers.SIGNIFICANT ?? 0) + (tiers.EXTREME ?? 0);
}

function rowsWrittenFromJobMetadata(job: SecurityBackfillJob): number {
  const checkpoint = job.metadata?.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") return 0;
  const rows = (checkpoint as { rowsWritten?: number }).rowsWritten;
  return typeof rows === "number" ? rows : 0;
}

function snapshotResumeOnlyMetrics(
  job: SecurityBackfillJob,
  coverageGapsBefore: number | null,
  coverageGapsAfter: number | null,
): ResumeOnlyRunMetrics {
  return {
    cursorToken: job.cursorToken,
    processedCount: job.processedCount,
    rowsWritten: rowsWrittenFromJobMetadata(job),
    episodesWritten: episodesFromJobMetadata(job),
    coverageGapsRecorded:
      coverageGapsBefore === null || coverageGapsAfter === null
        ? null
        : Math.max(0, coverageGapsAfter - coverageGapsBefore),
  };
}

function countCoverageGapsIfSupported(
  intelligence: HistoricalPersistence["intelligence"],
): number | null {
  const store = intelligence as { listCoverageGaps?: (securityId?: string) => readonly unknown[] };
  if (typeof store.listCoverageGaps !== "function") return null;
  return store.listCoverageGaps().length;
}

function logResumeOnlyTerminal(payload: {
  event: ResumeOnlyTerminalEvent;
  jobId: string;
  startingCursor: string | null;
  endingCursor: string | null;
  finalJobState: string;
  securitiesProcessedDuringRun: number;
  dailyRowsWrittenDuringRun: number;
  episodesWrittenDuringRun: number;
  coverageGapsRecordedDuringRun: number | null;
  providerDailyRequests: number;
  providerReferenceRequests: number;
  stopReason: CatchUpStopReason | ResumeOnlyRefusalReason | "none";
}): void {
  logEvent({
    ...payload,
    eligibilityJobCreated: false,
  });
}

export async function runHistoricalCatchUpResumeOnly(
  options: HistoricalCatchUpRolloutOptions = {},
): Promise<HistoricalCatchUpResumeOnlyResult> {
  if (options.loadLocalEnv) loadDotEnvFiles();
  let jobId = options.resumeJobId?.trim() ?? "";
  if (!jobId) {
    jobId = readHistoricalCatchupResumeOnlyFromEnv().jobId ?? "";
  }
  if (!jobId) {
    throw new Error("resume-only job id is required");
  }

  const targetResolved = resolveHistoricalCatchUpTargetSession({
    envValue: process.env[HISTORICAL_CATCHUP_TARGET_ENV],
    explicitTarget: options.targetSession,
    now: options.now,
  });
  if (targetResolved.ok === false) {
    throw new Error(targetResolved.error);
  }
  const targetSession = targetResolved.targetSession;
  const dateFrom = PRODUCTION_DATE_FROM;
  const limits = options.limits ?? readHistoricalCatchupLimitsFromEnv();
  const startedAt = Date.now();

  const persistence = createHistoricalPersistence({
    loadLocalEnv: false,
    persistenceOverride: options.persistenceOverride,
  });

  const finishNoop = async (
    reason: ResumeOnlyRefusalReason,
    finalJobState: string,
    startingCursor: string | null,
  ): Promise<HistoricalCatchUpResumeOnlyResult> => {
    const result: HistoricalCatchUpResumeOnlyResult = {
      terminalEvent: "resume_only_noop",
      jobId,
      startingCursor,
      endingCursor: startingCursor,
      finalJobState,
      securitiesProcessedDuringRun: 0,
      dailyRowsWrittenDuringRun: 0,
      episodesWrittenDuringRun: 0,
      coverageGapsRecordedDuringRun: 0,
      providerDailyRequests: 0,
      providerReferenceRequests: 0,
      stopReason: reason,
      eligibilityJobCreated: false,
      runtimeMs: Date.now() - startedAt,
    };
    logResumeOnlyTerminal({
      event: result.terminalEvent,
      jobId: result.jobId,
      startingCursor: result.startingCursor,
      endingCursor: result.endingCursor,
      finalJobState: result.finalJobState,
      securitiesProcessedDuringRun: 0,
      dailyRowsWrittenDuringRun: 0,
      episodesWrittenDuringRun: 0,
      coverageGapsRecordedDuringRun: 0,
      providerDailyRequests: 0,
      providerReferenceRequests: 0,
      stopReason: reason,
    });
    await persistence.close();
    return result;
  };

  try {
    const jobBefore = await persistence.intelligence.getJob(jobId);
    if (!jobBefore) {
      return finishNoop("job_missing", "MISSING", null);
    }
    const startingCursor = jobBefore.cursorToken;
    if (jobBefore.dateFrom !== dateFrom || jobBefore.dateTo !== targetSession) {
      return finishNoop("date_range_mismatch", jobBefore.state, startingCursor);
    }
    if (jobBefore.state === "COMPLETE") {
      return finishNoop("already_complete", jobBefore.state, startingCursor);
    }
    if (jobBefore.state !== "PAUSED" && jobBefore.state !== "FAILED" && jobBefore.state !== "RUNNING") {
      return finishNoop("not_resumable", jobBefore.state, startingCursor);
    }

    const counters: ProviderCounters = {
      dailyRequests: 0,
      referenceRequests: 0,
      http403: 0,
      http429: 0,
      nextPages: 0,
    };
    const logs: RequestLog[] = [];
    const budget = new ProviderRequestBudget(limits.maxProviderRequestsPerRun);
    let providerEntitlementFloor: string | null = null;
    let engine: HistoricalBackfillEngine;
    if (options.engineOverride) {
      engine = options.engineOverride;
    } else {
      const key = requirePolygonKey();
      providerEntitlementFloor = await validateEntitlementConfigForRollout(key, budget, counters, logs);
      engine = createEngine(persistence, key, budget, counters, logs, providerEntitlementFloor);
    }

    logEvent({
      event: "catch_up_start",
      mode: "resume_only",
      targetSession,
      completedSession: targetResolved.completedSession,
      transport: persistence.transport,
      limits,
      entitlementFloor: providerEntitlementFloor,
      jobId,
    });

    const gapsBefore = countCoverageGapsIfSupported(persistence.intelligence);
    const metricsBefore = snapshotResumeOnlyMetrics(jobBefore, gapsBefore, gapsBefore);

    let resumeResult: ResumeInterruptedJobsResult & { stats: BackfillJobStats };
    try {
      resumeResult = await resumeInterruptedJobById(
        engine,
        persistence,
        jobId,
        limits,
        counters,
        budget,
      );
    } catch (error) {
      const jobAfter = await persistence.intelligence.getJob(jobId);
      const gapsAfter = countCoverageGapsIfSupported(persistence.intelligence);
      const metricsAfter = jobAfter
        ? snapshotResumeOnlyMetrics(jobAfter, gapsBefore, gapsAfter)
        : metricsBefore;
      logResumeOnlyTerminal({
        event: "resume_only_failed",
        jobId,
        startingCursor,
        endingCursor: metricsAfter.cursorToken,
        finalJobState: jobAfter?.state ?? "FAILED",
        securitiesProcessedDuringRun: Math.max(0, metricsAfter.processedCount - metricsBefore.processedCount),
        dailyRowsWrittenDuringRun: Math.max(0, metricsAfter.rowsWritten - metricsBefore.rowsWritten),
        episodesWrittenDuringRun: Math.max(0, metricsAfter.episodesWritten - metricsBefore.episodesWritten),
        coverageGapsRecordedDuringRun: metricsAfter.coverageGapsRecorded,
        providerDailyRequests: counters.dailyRequests,
        providerReferenceRequests: counters.referenceRequests,
        stopReason: "none",
      });
      throw error;
    }

    const jobAfter = await persistence.intelligence.getJob(jobId);
    if (!jobAfter) {
      throw new Error(`resume-only job ${jobId} disappeared after run`);
    }
    const gapsAfter = countCoverageGapsIfSupported(persistence.intelligence);
    const metricsAfter = snapshotResumeOnlyMetrics(jobAfter, gapsBefore, gapsAfter);

    const terminalEvent: ResumeOnlyTerminalEvent = resumeResult.stats.state === "COMPLETE"
      ? "resume_only_complete"
      : "resume_only_paused";

    const result: HistoricalCatchUpResumeOnlyResult = {
      terminalEvent,
      jobId,
      startingCursor,
      endingCursor: metricsAfter.cursorToken,
      finalJobState: jobAfter.state,
      securitiesProcessedDuringRun: Math.max(0, metricsAfter.processedCount - metricsBefore.processedCount),
      dailyRowsWrittenDuringRun: Math.max(0, metricsAfter.rowsWritten - metricsBefore.rowsWritten),
      episodesWrittenDuringRun: Math.max(0, metricsAfter.episodesWritten - metricsBefore.episodesWritten),
      coverageGapsRecordedDuringRun: metricsAfter.coverageGapsRecorded,
      providerDailyRequests: counters.dailyRequests,
      providerReferenceRequests: counters.referenceRequests,
      stopReason: resumeResult.stopReason,
      eligibilityJobCreated: false,
      runtimeMs: Date.now() - startedAt,
    };

    logResumeOnlyTerminal({
      event: result.terminalEvent,
      jobId: result.jobId,
      startingCursor: result.startingCursor,
      endingCursor: result.endingCursor,
      finalJobState: result.finalJobState,
      securitiesProcessedDuringRun: result.securitiesProcessedDuringRun,
      dailyRowsWrittenDuringRun: result.dailyRowsWrittenDuringRun,
      episodesWrittenDuringRun: result.episodesWrittenDuringRun,
      coverageGapsRecordedDuringRun: result.coverageGapsRecordedDuringRun,
      providerDailyRequests: result.providerDailyRequests,
      providerReferenceRequests: result.providerReferenceRequests,
      stopReason: result.stopReason,
    });

    await persistence.close();
    return result;
  } catch (error) {
    await persistence.close();
    throw error;
  }
}

export async function runHistoricalCatchUpRollout(
  options: HistoricalCatchUpRolloutOptions = {},
): Promise<ProductionRolloutResult> {
  if (options.loadLocalEnv) loadDotEnvFiles();
  const targetResolved = resolveHistoricalCatchUpTargetSession({
    envValue: process.env[HISTORICAL_CATCHUP_TARGET_ENV],
    explicitTarget: options.targetSession,
    now: options.now,
  });
  if (targetResolved.ok === false) {
    throw new Error(targetResolved.error);
  }
  const targetSession = targetResolved.targetSession;
  const dateFrom = PRODUCTION_DATE_FROM;
  const limits = options.limits ?? readHistoricalCatchupLimitsFromEnv();
  const eligibilityBatchSize = readHistoricalCatchupEligibilityBatchSizeFromEnv();

  const startedAt = Date.now();
  const key = requirePolygonKey();
  const persistence = createHistoricalPersistence({
    loadLocalEnv: options.loadLocalEnv,
    persistenceOverride: options.persistenceOverride,
  });
  const { identity, intelligence } = persistence;
  const counters: ProviderCounters = {
    dailyRequests: 0,
    referenceRequests: 0,
    http403: 0,
    http429: 0,
    nextPages: 0,
  };
  const logs: RequestLog[] = [];
  const budget = new ProviderRequestBudget(limits.maxProviderRequestsPerRun);
  const providerEntitlementFloor = await validateEntitlementConfigForRollout(key, budget, counters, logs);
  const engine = createEngine(persistence, key, budget, counters, logs, providerEntitlementFloor);

  logEvent({
    event: "catch_up_start",
    targetSession,
    completedSession: targetResolved.completedSession,
    transport: persistence.transport,
    limits,
    eligibilityBatchSize,
    effectiveEligibilityBatchSize: effectiveEligibilityBatchSize(
      eligibilityBatchSize,
      limits.maxSymbolsPerRun,
    ),
    entitlementFloor: providerEntitlementFloor,
  });

  let stopReason: CatchUpStopReason = "none";
  let blockedInterruptedJobId: string | null = null;

  const resumeResult = await resumeInterruptedJobs(
    engine,
    persistence,
    dateFrom,
    targetSession,
    limits,
    counters,
    budget,
  );
  if (resumeResult.blockNewJobs) {
    stopReason = resumeResult.stopReason;
    blockedInterruptedJobId = resumeResult.interruptedJobId;
    logEvent({
      event: "catch_up_stop",
      reason: stopReason,
      jobId: blockedInterruptedJobId,
      counters,
    });
  }

  let batchesRun = 0;
  let symbolsAttempted = 0;
  let symbolsResolved = 0;
  let symbolsSkipped = 0;
  let noProgressBatches = 0;
  let emptyResolutionBatches = 0;

  while (
    !blockedInterruptedJobId
    && batchesRun < limits.maxBatchesPerRun
    && symbolsAttempted < limits.maxSymbolsPerRun
  ) {
    const complete = await loadCatchUpCompleteSymbols(persistence, dateFrom, targetSession);
    const eligible = await persistence.rollout.loadEligibleSymbols(complete, PRODUCTION_CANARY_SYMBOLS);
    if (eligible.length === 0) break;

    const size = resolveEligibilityTrancheSize({
      batchesRun,
      eligibilityBatchSize,
      limits,
      symbolsAttempted,
    });
    const batchSymbols = eligible.slice(0, size);
    const batchNumber = batchesRun + 1;
    const batchStarted = Date.now();
    const recordedAt = new Date().toISOString();
    const securityIds: SecurityId[] = [];
    let resolutionStopped = false;
    for (let symbolIndex = 0; symbolIndex < batchSymbols.length; symbolIndex += 1) {
      const symbol = batchSymbols[symbolIndex]!;
      symbolsAttempted += 1;
      try {
        const id = await resolveSymbol(
          symbol,
          key,
          identity,
          recordedAt,
          budget,
          counters,
          logs,
          targetSession,
        );
        if (id) {
          securityIds.push(id);
          symbolsResolved += 1;
        } else {
          symbolsSkipped += 1;
        }
      } catch (error) {
        if (isProviderBudgetExhausted(error)) {
          stopReason = "provider_request_limit";
          resolutionStopped = true;
          logEvent({ event: "catch_up_stop", reason: stopReason, counters, phase: "symbol_resolution" });
          break;
        }
        if (error instanceof IdentityResolutionPersistenceError) {
          logIdentityResolutionFailure({
            symbol: error.symbol,
            symbolIndex: symbolIndex + 1,
            symbolsAttempted,
            targetSession,
            stage: error.stage,
            providerRequestsUsed: providerRequestTotal(counters),
            providerRequestsMax: limits.maxProviderRequestsPerRun,
            backfillJobCreated: batchesRun > 0 || blockedInterruptedJobId !== null,
            error,
          });
        }
        throw error;
      }
    }
    if (resolutionStopped) break;
    if (securityIds.length === 0) {
      emptyResolutionBatches += 1;
      logEvent({ event: "batch_skipped", batch: batchNumber, reason: "no_resolvable_identities" });
      if (emptyResolutionBatches >= limits.maxEmptyResolutionBatches) {
        throw new Error(`batch ${batchNumber} had no resolvable identities`);
      }
      continue;
    }

    const providerStarts = await buildProviderStarts(intelligence, securityIds, dateFrom);
    const started = await engine.start({
      securities: securityIds.map((securityId) => ({ securityId })),
      completedSessionDate: targetSession,
      dateFrom,
      dateTo: targetSession,
      recordedAt,
      jobType: "SECURITY_DAILY_HISTORY_CATCHUP",
      providerStarts,
    });
    if (!started.ok) throw new Error(started.reason);
    const stats = await advanceJobWithinFlyLimits(engine, started.record.jobId, limits, counters, budget);
    batchesRun += 1;

    if (stats.rowsWritten === 0 && stats.state === "COMPLETE") {
      noProgressBatches += 1;
    } else {
      noProgressBatches = 0;
    }

    logEvent({
      event: "batch_complete",
      batch: batchNumber,
      jobId: started.record.jobId,
      state: stats.state,
      securitiesProcessed: stats.securitiesProcessed,
      rowsWritten: stats.rowsWritten,
      episodesWritten: episodesWritten(stats),
      providerErrors: stats.providerErrors,
      elapsedMs: Date.now() - batchStarted,
    });

    if (stats.state === "FAILED") {
      throw new Error(`batch ${batchNumber} failed`);
    }
    if (stats.state === "PAUSED") {
      stopReason = "job_paused";
      blockedInterruptedJobId = started.record.jobId;
      logEvent({ event: "catch_up_stop", reason: stopReason, jobId: started.record.jobId });
      break;
    }
    if (stats.state === "RUNNING") {
      stopReason = budget.used >= limits.maxProviderRequestsPerRun
        ? "provider_request_limit"
        : "fly_run_limits";
      blockedInterruptedJobId = started.record.jobId;
      logEvent({ event: "catch_up_stop", reason: stopReason, jobId: started.record.jobId });
      break;
    }
    if (noProgressBatches >= limits.maxNoProgressBatches) {
      stopReason = "no_progress";
      logEvent({ event: "catch_up_stop", reason: stopReason, batch: batchNumber });
      break;
    }
  }

  const completeSymbols = await loadCatchUpCompleteSymbols(persistence, dateFrom, targetSession);
  const eligibleRemaining = (await persistence.rollout.loadEligibleSymbols(
    completeSymbols,
    PRODUCTION_CANARY_SYMBOLS,
  )).length;
  const interruptedStill = blockedInterruptedJobId
    ?? (await persistence.rollout.findInterruptedJob(dateFrom, targetSession))?.jobId
    ?? null;

  const outcome = resolveCatchUpRolloutOutcome({
    stopReason,
    eligibleSymbolsRemaining: eligibleRemaining,
    interruptedJobId: interruptedStill,
  });
  const eventName = catchUpRolloutEventName(outcome);
  logEvent({
    event: eventName,
    outcome,
    stopReason,
    targetSession,
    batchesRun,
    symbolsAttempted,
    symbolsResolved,
    symbolsSkipped,
    eligibleSymbolsRemaining: eligibleRemaining,
    interruptedJobId: interruptedStill,
    provider: counters,
    elapsedMs: Date.now() - startedAt,
  });
  await persistence.close();
  return {
    batchesRun,
    symbolsAttempted,
    symbolsResolved,
    symbolsSkipped,
    provider: counters,
    runtimeMs: Date.now() - startedAt,
    outcome,
    stopReason,
    eligibleSymbolsRemaining: eligibleRemaining,
  };
}

/** @deprecated Use runHistoricalCatchUpRollout — requires HISTORICAL_CATCHUP_TARGET_SESSION. */
export async function runProductionHistoricalRollout(
  options: HistoricalCatchUpRolloutOptions = {},
): Promise<ProductionRolloutResult> {
  return runHistoricalCatchUpRollout(options);
}
