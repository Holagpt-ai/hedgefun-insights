import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import { historicalBackfillConfig } from "@/config/historical-backfill.config";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { createPolygonDailyAdapter } from "@/lib/historical-backfill/polygon-daily-adapter";
import { loadDotEnvFiles } from "@/lib/persistence/production-database";
import {
  createHistoricalPersistence,
  type HistoricalIdentityRepository,
  type HistoricalPersistence,
} from "@/lib/persistence/historical-persistence";
import { createProductionSupabaseClient } from "@/lib/persistence/supabase-server";
import { HistoricalFactConflictError } from "@/lib/security-intelligence/postgres-security-intelligence";
import type { SecurityType } from "@/config/security-identity.config";
import type { BackfillJobStats } from "@/types/historical-backfill";
import type { SecurityId } from "@/types/security-identity";

export const PRODUCTION_CANARY_SYMBOLS = new Set([
  "INTC", "OGN", "NWL", "AMD", "APA", "ALK", "AOS", "BEN", "BBY", "FMC",
]);
export const PRODUCTION_DATE_FROM = HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE;
export const PRODUCTION_DATE_TO = "2026-09-18";
const FULL_SPAN_DAYS = 2000;
const FIRST_BATCH = 100;
const NEXT_BATCH = 500;
/** Sessions below this count are treated as incomplete for rollout skip logic. */
const MIN_COMPLETED_SESSIONS = 1200;

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

async function polygon(
  counters: ProviderCounters,
  logs: RequestLog[],
  kind: RequestLog["kind"],
  path: string,
  params: Record<string, string>,
  key: string,
): Promise<Record<string, unknown>> {
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
  return json ?? {};
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
  counters: ProviderCounters,
  logs: RequestLog[],
): Promise<SecurityId | null> {
  const details = await polygon(counters, logs, "reference", `/v3/reference/tickers/${symbol}`, {}, key);
  const events = await polygon(counters, logs, "events", `/vX/reference/tickers/${symbol}/events`, {}, key);
  const row = details.results && typeof details.results === "object" ? details.results as Record<string, unknown> : null;
  if (!row || details.status === "NOT_FOUND" || row.ticker == null) return null;
  const listDate = typeof row.list_date === "string" ? row.list_date.slice(0, 10) : null;
  const listYear = listDate ? Number(listDate.slice(0, 4)) : NaN;
  const usableListDate = listDate !== null && listYear >= 1970 && listYear <= 2100 ? listDate : null;
  const effectiveDate = usableListDate && usableListDate <= PRODUCTION_DATE_FROM ? usableListDate : PRODUCTION_DATE_FROM;
  const inWindowChanges = tickerChanges(events).filter((change) =>
    change.date > PRODUCTION_DATE_FROM && change.date <= PRODUCTION_DATE_TO,
  );
  const locale = typeof row.locale === "string" ? row.locale.toUpperCase() : null;
  const resolved = await identity.resolve({
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
  if (resolved.status !== "RESOLVED" || !resolved.securityId) return null;
  for (const change of inWindowChanges) {
    if (change.ticker === symbol) continue;
    await identity.resolve({
      symbol: change.ticker,
      exchange: typeof row.primary_exchange === "string" ? row.primary_exchange : null,
      effectiveDate: change.date,
      compositeFigi: typeof row.composite_figi === "string" ? row.composite_figi : null,
      source: "polygon-reference-events",
      provenance: "PROVIDER",
      recordedAt,
    });
  }
  return resolved.securityId;
}

function createEngine(
  persistence: HistoricalPersistence,
  key: string,
  counters: ProviderCounters,
  logs: RequestLog[],
) {
  const { identity, intelligence } = persistence;
  const config = historicalBackfillConfig({
    dateChunkDays: FULL_SPAN_DAYS,
    maxChunksPerRun: 5,
    maxConcurrentProviderRequests: 1,
    retryCount: 2,
    retryBackoffMs: 400,
    verifiedEarliestDailyDate: PRODUCTION_DATE_FROM,
  });
  const adapter = createPolygonDailyAdapter({
    verifiedEarliestDailyDate: PRODUCTION_DATE_FROM,
    fetchAggregates: async (ticker, multiplier, timespan, from, to) => {
      if (timespan !== "day" || multiplier !== 1) throw new Error("refused non-daily aggregate request");
      if (from < PRODUCTION_DATE_FROM) throw new Error("refused daily request before entitlement");
      return polygon(counters, logs, "daily", `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
        adjusted: "true",
        sort: "asc",
        limit: "50000",
      }, key);
    },
    fetchNextPage: async (nextUrl) => {
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
      return json;
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

async function runJobToCompletion(
  engine: HistoricalBackfillEngine,
  jobId: string,
): Promise<BackfillJobStats> {
  const recordedAt = new Date().toISOString();
  let stats = await engine.stats(jobId, recordedAt);
  while (stats.state === "RUNNING") {
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

async function resumeInterruptedJobs(engine: HistoricalBackfillEngine, persistence: HistoricalPersistence): Promise<void> {
  while (true) {
    const interrupted = await persistence.rollout.findInterruptedJob(PRODUCTION_DATE_FROM, PRODUCTION_DATE_TO);
    if (!interrupted) return;
    const started = Date.now();
    if (interrupted.state === "PAUSED" || interrupted.state === "FAILED") {
      const resumed = await engine.resume(interrupted.jobId, new Date().toISOString());
      if (!resumed.ok) throw new Error(`resume blocked: ${resumed.reason}`);
    }
    const stats = await runJobToCompletion(engine, interrupted.jobId);
    logEvent({
      event: "batch_complete",
      jobId: interrupted.jobId,
      resumed: interrupted.state !== "RUNNING",
      state: stats.state,
      securitiesProcessed: stats.securitiesProcessed,
      rowsWritten: stats.rowsWritten,
      episodesWritten: episodesWritten(stats),
      providerErrors: stats.providerErrors,
      elapsedMs: Date.now() - started,
    });
    if (stats.state !== "COMPLETE") {
      throw new Error(`job ${interrupted.jobId} blocked in state ${stats.state}`);
    }
  }
}

export interface ProductionRolloutResult {
  batchesRun: number;
  symbolsAttempted: number;
  symbolsResolved: number;
  symbolsSkipped: number;
  provider: ProviderCounters;
  runtimeMs: number;
}

export const PRODUCTION_CONNECTIVITY_JOB_ID = "0ab000ee-6f58-4e21-ba68-4a095a97f584";

export async function runHistoricalBackfillConnectivityCheck(options: {
  loadLocalEnv?: boolean;
  jobId?: string;
} = {}): Promise<{ transport: string; jobId: string; jobState: string | null }> {
  const persistence = createHistoricalPersistence(options);
  const jobId = options.jobId ?? PRODUCTION_CONNECTIVITY_JOB_ID;
  try {
    const job = await persistence.intelligence.getJob(jobId);
    if (!job) throw new Error(`connectivity check: job ${jobId} not found`);
    if (persistence.transport === "supabase") {
      const supabase = createProductionSupabaseClient();
      const { error } = await supabase.rpc("historical_apply_daily_batch", { p_rows: [] });
      if (error) throw new Error(error.message);
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
      const engine = createEngine(persistence, requirePolygonKey(), {
        dailyRequests: 0,
        referenceRequests: 0,
        http403: 0,
        http429: 0,
        nextPages: 0,
      }, []);
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

export async function runProductionHistoricalRollout(options: { loadLocalEnv?: boolean } = {}): Promise<ProductionRolloutResult> {
  if (options.loadLocalEnv) loadDotEnvFiles();
  const startedAt = Date.now();
  const key = requirePolygonKey();
  const persistence = createHistoricalPersistence(options);
  const { identity } = persistence;
  const counters: ProviderCounters = {
    dailyRequests: 0,
    referenceRequests: 0,
    http403: 0,
    http429: 0,
    nextPages: 0,
  };
  const logs: RequestLog[] = [];
  const engine = createEngine(persistence, key, counters, logs);

  await resumeInterruptedJobs(engine, persistence);

  let batchesRun = 0;
  let symbolsAttempted = 0;
  let symbolsResolved = 0;
  let symbolsSkipped = 0;

  while (true) {
    const backfilled = await persistence.rollout.loadBackfilledSymbols(
      PRODUCTION_DATE_FROM,
      PRODUCTION_DATE_TO,
      MIN_COMPLETED_SESSIONS,
    );
    const eligible = await persistence.rollout.loadEligibleSymbols(backfilled, PRODUCTION_CANARY_SYMBOLS);
    if (eligible.length === 0) break;
    const size = batchesRun === 0 ? FIRST_BATCH : NEXT_BATCH;
    const batchSymbols = eligible.slice(0, size);
    const batchNumber = batchesRun + 1;
    const batchStarted = Date.now();
    const recordedAt = new Date().toISOString();
    const securityIds: SecurityId[] = [];
    for (const symbol of batchSymbols) {
      symbolsAttempted += 1;
      const id = await resolveSymbol(symbol, key, identity, recordedAt, counters, logs);
      if (id) {
        securityIds.push(id);
        symbolsResolved += 1;
      } else {
        symbolsSkipped += 1;
      }
    }
    if (securityIds.length === 0) {
      throw new Error(`batch ${batchNumber} had no resolvable identities`);
    }

    const started = await engine.start({
      securities: securityIds.map((securityId) => ({ securityId })),
      completedSessionDate: PRODUCTION_DATE_TO,
      dateFrom: PRODUCTION_DATE_FROM,
      dateTo: PRODUCTION_DATE_TO,
      recordedAt,
    });
    if (!started.ok) throw new Error(started.reason);
    const stats = await runJobToCompletion(engine, started.record.jobId);
    batchesRun += 1;
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
    if (stats.state !== "COMPLETE") {
      throw new Error(`batch ${batchNumber} blocked in state ${stats.state}`);
    }
  }

  logEvent({
    event: "rollout_complete",
    batchesRun,
    symbolsAttempted,
    symbolsResolved,
    symbolsSkipped,
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
  };
}
