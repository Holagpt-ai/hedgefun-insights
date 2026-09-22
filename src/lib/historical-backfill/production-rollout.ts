import type { Sql } from "postgres";
import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import { historicalBackfillConfig } from "@/config/historical-backfill.config";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { createPolygonDailyAdapter } from "@/lib/historical-backfill/polygon-daily-adapter";
import {
  loadDotEnvFiles,
  openProductionSql,
  requireProductionDatabaseUrl,
} from "@/lib/persistence/production-database";
import { PostgresSecurityIdentityRepository } from "@/lib/security-identity/postgres-security-identity";
import { HistoricalFactConflictError, PostgresSecurityIntelligenceRepository } from "@/lib/security-intelligence/postgres-security-intelligence";
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

async function loadBackfilledSymbols(sql: Sql): Promise<Set<string>> {
  const rows = await sql<{ symbol: string }[]>`
    select s.current_symbol as symbol
    from public.securities s
    inner join (
      select security_id, count(*)::int as n
      from public.security_daily_history
      where session_date >= ${PRODUCTION_DATE_FROM} and session_date <= ${PRODUCTION_DATE_TO}
      group by security_id
    ) h on h.security_id = s.security_id
    where h.n >= ${MIN_COMPLETED_SESSIONS}
  `;
  return new Set(rows.map((row) => row.symbol));
}

async function loadEligibleSymbols(sql: Sql, backfilled: Set<string>): Promise<string[]> {
  const rows = await sql<{ symbol: string }[]>`
    select symbol from public.ticker_search
    where active is true and type = 'CS'
    order by symbol
  `;
  return rows
    .map((row) => row.symbol)
    .filter((symbol) => !PRODUCTION_CANARY_SYMBOLS.has(symbol) && !backfilled.has(symbol));
}

async function resolveSymbol(
  symbol: string,
  key: string,
  identity: PostgresSecurityIdentityRepository,
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
  identity: PostgresSecurityIdentityRepository,
  intelligence: PostgresSecurityIntelligenceRepository,
  key: string,
  counters: ProviderCounters,
  logs: RequestLog[],
) {
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

async function findInterruptedJob(sql: Sql): Promise<{ jobId: string; state: string } | null> {
  const rows = await sql<{ job_id: string; state: string }[]>`
    select job_id, state
    from public.security_backfill_jobs
    where state in ('RUNNING', 'PAUSED', 'FAILED')
      and date_from = ${PRODUCTION_DATE_FROM}
      and date_to = ${PRODUCTION_DATE_TO}
    order by updated_at desc
    limit 1
  `;
  return rows[0] ? { jobId: rows[0].job_id, state: rows[0].state } : null;
}

async function resumeInterruptedJobs(engine: HistoricalBackfillEngine, sql: Sql): Promise<void> {
  while (true) {
    const interrupted = await findInterruptedJob(sql);
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

export async function runProductionHistoricalRollout(options: { loadLocalEnv?: boolean } = {}): Promise<ProductionRolloutResult> {
  if (options.loadLocalEnv) loadDotEnvFiles();
  const startedAt = Date.now();
  const key = requirePolygonKey();
  const sql = openProductionSql(requireProductionDatabaseUrl());
  const identity = new PostgresSecurityIdentityRepository(sql);
  const intelligence = new PostgresSecurityIntelligenceRepository(sql);
  const counters: ProviderCounters = {
    dailyRequests: 0,
    referenceRequests: 0,
    http403: 0,
    http429: 0,
    nextPages: 0,
  };
  const logs: RequestLog[] = [];
  const engine = createEngine(identity, intelligence, key, counters, logs);

  await resumeInterruptedJobs(engine, sql);

  let batchesRun = 0;
  let symbolsAttempted = 0;
  let symbolsResolved = 0;
  let symbolsSkipped = 0;

  while (true) {
    const eligible = await loadEligibleSymbols(sql, await loadBackfilledSymbols(sql));
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
  await sql.end();
  return {
    batchesRun,
    symbolsAttempted,
    symbolsResolved,
    symbolsSkipped,
    provider: counters,
    runtimeMs: Date.now() - startedAt,
  };
}
