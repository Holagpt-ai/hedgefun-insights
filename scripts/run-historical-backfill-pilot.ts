/**
 * Controlled 10-security historical pilot against the local Postgres only.
 * Does not read production Supabase and does not request minute bars.
 */
import { writeFileSync } from "node:fs";
import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { detectDailyEpisode } from "@/lib/historical-backfill/episode-detector";
import { historicalDailyRvol } from "@/lib/historical-backfill/historical-rvol";
import { createPolygonDailyAdapter } from "@/lib/historical-backfill/polygon-daily-adapter";
import { historicalBackfillConfig } from "@/config/historical-backfill.config";
import {
  LOCAL_PILOT_DATABASE_URL,
  openLocalPilotSql,
  resetLocalPilotTables,
} from "@/lib/persistence/local-pilot-database";
import { PostgresSecurityIdentityRepository } from "@/lib/security-identity/postgres-security-identity";
import { PostgresSecurityIntelligenceRepository } from "@/lib/security-intelligence/postgres-security-intelligence";
import type { SecurityType } from "@/config/security-identity.config";
import type { SecurityId } from "@/types/security-identity";

const SYMBOLS = ["INTC", "OGN", "NWL", "AMD", "APA", "ALK", "AOS", "BEN", "BBY", "FMC"] as const;
const DATE_FROM = HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE;
const DATE_TO = "2026-09-18";
const RECORDED = "2026-09-21T21:40:00.000Z";
const FULL_SPAN_DAYS = 2000;

interface RequestLog {
  kind: "reference" | "events" | "daily" | "daily_page";
  symbol: string;
  http: number;
  ms: number;
  providerStatus: string | null;
  results: number;
  next: boolean;
  error: string | null;
}

const requests: RequestLog[] = [];

function requireKey(): string {
  const key = process.env.POLYGON_API_KEY?.trim() ?? "";
  if (!key) throw new Error("POLYGON_API_KEY is required for the local pilot");
  return key;
}

async function polygon(kind: RequestLog["kind"], symbol: string, path: string, params: Record<string, string>, key: string) {
  const url = new URL(`https://api.polygon.io${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("apiKey", key);
  const started = Date.now();
  const response = await fetch(url);
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }
  const results = Array.isArray(json?.results) ? json.results : json?.results ? [json.results] : [];
  requests.push({
    kind,
    symbol,
    http: response.status,
    ms: Date.now() - started,
    providerStatus: typeof json?.status === "string" ? json.status : null,
    results: results.length,
    next: typeof json?.next_url === "string" && json.next_url.length > 0,
    error: typeof json?.error === "string" ? json.error : typeof json?.message === "string" ? json.message : null,
  });
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`${kind} ${symbol} HTTP ${response.status}`);
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

async function main() {
  const key = requireKey();
  const sql = openLocalPilotSql(LOCAL_PILOT_DATABASE_URL);
  await resetLocalPilotTables(sql);
  const identity = new PostgresSecurityIdentityRepository(sql);
  const intelligence = new PostgresSecurityIntelligenceRepository(sql);
  const startedAt = Date.now();
  const referenceNotes: Array<Record<string, unknown>> = [];
  const securityIds = new Map<string, SecurityId>();

  for (const symbol of SYMBOLS) {
    const details = await polygon("reference", symbol, `/v3/reference/tickers/${symbol}`, {}, key);
    const events = await polygon("events", symbol, `/vX/reference/tickers/${symbol}/events`, {}, key);
    const row = details.results && typeof details.results === "object" ? details.results as Record<string, unknown> : null;
    if (!row || details.status === "NOT_FOUND" || row.ticker == null) {
      throw new Error(`${symbol} could not be resolved from provider reference`);
    }
    const listDate = typeof row.list_date === "string" ? row.list_date.slice(0, 10) : null;
    const listYear = listDate ? Number(listDate.slice(0, 4)) : NaN;
    const usableListDate = listDate !== null && listYear >= 1970 && listYear <= 2100 ? listDate : null;
    const effectiveDate = usableListDate && usableListDate <= DATE_FROM ? usableListDate : DATE_FROM;
    const changes = tickerChanges(events);
    const inWindowChanges = changes.filter((change) => change.date > DATE_FROM && change.date <= DATE_TO);
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
      recordedAt: RECORDED,
    });
    if (!resolved.securityId) throw new Error(`${symbol} identity unresolved: ${resolved.reason}`);
    for (const change of inWindowChanges) {
      if (change.ticker === symbol) continue;
      await identity.resolve({
        symbol: change.ticker,
        exchange: typeof row.primary_exchange === "string" ? row.primary_exchange : null,
        effectiveDate: change.date,
        compositeFigi: typeof row.composite_figi === "string" ? row.composite_figi : null,
        source: "polygon-reference-events",
        provenance: "PROVIDER",
        recordedAt: RECORDED,
      });
    }
    securityIds.set(symbol, resolved.securityId);
    referenceNotes.push({
      symbol,
      securityId: resolved.securityId,
      status: resolved.status,
      created: resolved.created,
      listDate,
      listDateUsed: usableListDate !== null,
      effectiveDate,
      compositeFigi: typeof row.composite_figi === "string",
      figi: typeof row.share_class_figi === "string",
      cik: typeof row.cik === "string",
      inWindowTickerChanges: inWindowChanges.length,
      active: row.active === true,
    });
  }

  const config = historicalBackfillConfig({
    dateChunkDays: FULL_SPAN_DAYS,
    maxChunksPerRun: 1,
    maxConcurrentProviderRequests: 1,
    retryCount: 2,
    retryBackoffMs: 400,
    verifiedEarliestDailyDate: DATE_FROM,
  });
  const adapter = createPolygonDailyAdapter({
    verifiedEarliestDailyDate: DATE_FROM,
    fetchAggregates: async (ticker, multiplier, timespan, from, to) => {
      if (timespan !== "day" || multiplier !== 1) throw new Error("pilot refused a non-daily aggregate request");
      if (from < DATE_FROM) throw new Error("pilot refused a daily request before entitlement");
      return polygon("daily", ticker, `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
        adjusted: "true",
        sort: "asc",
        limit: "50000",
      }, key);
    },
    fetchNextPage: async (nextUrl) => {
      const url = new URL(nextUrl);
      const symbol = url.pathname.split("/")[4] ?? "UNKNOWN";
      if (!url.searchParams.get("apiKey")) url.searchParams.set("apiKey", key);
      const started = Date.now();
      const response = await fetch(url);
      const json = await response.json() as Record<string, unknown>;
      requests.push({
        kind: "daily_page",
        symbol,
        http: response.status,
        ms: Date.now() - started,
        providerStatus: typeof json.status === "string" ? json.status : null,
        results: Array.isArray(json.results) ? json.results.length : 0,
        next: typeof json.next_url === "string",
        error: typeof json.error === "string" ? json.error : null,
      });
      return json;
    },
  });

  const securities = SYMBOLS.map((symbol) => ({ securityId: securityIds.get(symbol)! }));
  const engine = new HistoricalBackfillEngine({
    identity,
    intelligence,
    provider: adapter,
    config,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  const ingestStarted = Date.now();
  const job = await engine.start({
    securities,
    completedSessionDate: DATE_TO,
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    recordedAt: RECORDED,
  });
  if (!job.ok) throw new Error(job.reason);
  const firstPass = await engine.runBatch(job.record.jobId, "2026-09-21T21:45:00.000Z");
  const firstSymbol = SYMBOLS[0];
  const firstId = securityIds.get(firstSymbol)!;
  const afterFirst = await sql<{ n: string }[]>`
    select count(*)::text as n from public.security_daily_history where security_id = ${firstId}
  `;
  const continued = new HistoricalBackfillEngine({
    identity,
    intelligence,
    provider: adapter,
    config: { ...config, maxChunksPerRun: 20 },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  const rest = await continued.runBatch(job.record.jobId, "2026-09-21T21:50:00.000Z");
  const afterResume = await sql<{ n: string }[]>`
    select count(*)::text as n from public.security_daily_history where security_id = ${firstId}
  `;
  const ingestMs = Date.now() - ingestStarted;
  const ingestWriteProfile = { ...intelligence.writeProfile };
  const ingestDailyRequests = requests.filter((request) => request.kind === "daily" || request.kind === "daily_page");

  const idempotencyStarted = Date.now();
  const replay = new HistoricalBackfillEngine({
    identity,
    intelligence,
    provider: adapter,
    config: { ...config, maxChunksPerRun: 2 },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  const replayJob = await replay.start({
    securities: [{ securityId: firstId }],
    completedSessionDate: DATE_TO,
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    recordedAt: "2026-09-21T22:10:00.000Z",
  });
  if (!replayJob.ok) throw new Error(replayJob.reason);
  const replayStats = await replay.runBatch(replayJob.record.jobId, "2026-09-21T22:20:00.000Z");
  const idempotencyMs = Date.now() - idempotencyStarted;

  const dailyCounts = await sql<{ symbol: string; rows: string; null_close: string }[]>`
    select s.current_symbol as symbol, count(*)::text as rows,
           count(*) filter (where h.close is null)::text as null_close
    from public.security_daily_history h
    join public.securities s on s.security_id = h.security_id
    group by s.current_symbol
    order by s.current_symbol
  `;
  const duplicateKeys = await sql<{ n: string }[]>`
    select count(*)::text as n from (
      select security_id, session_date from public.security_daily_history
      group by security_id, session_date having count(*) > 1
    ) d
  `;
  const episodeCounts = await sql<{ symbol: string; tier: string; n: string }[]>`
    select s.current_symbol as symbol, e.tier, count(*)::text as n
    from public.market_behavior_episodes e
    join public.securities s on s.security_id = e.security_id
    group by s.current_symbol, e.tier
    order by s.current_symbol, e.tier
  `;
  const samples = await sql<{
    symbol: string; session_date: string; tier: string; direction: string;
    move_pct: string | null; volume: string | null; dollar_volume: string | null; rvol: string | null;
  }[]>`
    select s.current_symbol as symbol, e.episode_start::date::text as session_date, e.tier, e.direction,
           e.max_positive_move_pct::text as move_pct, e.volume::text, e.dollar_volume::text, e.rvol::text
    from public.market_behavior_episodes e
    join public.securities s on s.security_id = e.security_id
    order by e.tier, e.episode_start
    limit 12
  `;
  const deep = await sql<{ metadata: unknown }[]>`
    select metadata from public.security_backfill_jobs where job_id = ${job.record.jobId}
  `;
  const sizes = await sql<{ relname: string; bytes: string }[]>`
    select c.relname, pg_total_relation_size(c.oid)::text as bytes
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in (
        'securities', 'security_symbol_history', 'security_reference_identifiers',
        'security_daily_history', 'market_behavior_episodes', 'security_backfill_jobs'
      )
    order by c.relname
  `;

  const rvolChecks: Array<Record<string, unknown>> = [];
  const normalBySymbol: Record<string, number> = {};
  const thresholds = historicalBackfillConfig();
  for (const symbol of ["INTC", "NWL", "APA"]) {
    const securityId = securityIds.get(symbol)!;
    const bars = await sql<{ session_date: string; close: string | null; volume: string | null; open: string; high: string; low: string; dollar_volume: string | null; move_pct: string | null; previous_close: string | null }[]>`
      select session_date::text, close::text, volume::text, open::text, high::text, low::text,
             dollar_volume::text, move_pct::text, previous_close::text
      from public.security_daily_history
      where security_id = ${securityId}
      order by session_date
    `;
    const sessions = bars.map((bar) => ({
      sessionDate: bar.session_date,
      volume: bar.volume == null ? null : Number(bar.volume),
    }));
    let normal = 0;
    for (const bar of bars) {
      const detection = detectDailyEpisode({
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        movePct: bar.move_pct == null ? null : Number(bar.move_pct),
        dollarVolume: bar.dollar_volume == null ? null : Number(bar.dollar_volume),
        rvol: historicalDailyRvol(sessions, bar.session_date, bar.volume == null ? null : Number(bar.volume), 20),
        previousClose: bar.previous_close == null ? null : Number(bar.previous_close),
      }, thresholds);
      if (detection.tier === "NORMAL") normal += 1;
    }
    normalBySymbol[symbol] = normal;
    for (const index of [10, 25, Math.floor(bars.length / 2), bars.length - 1]) {
      const bar = bars[index];
      if (!bar) continue;
      const prior = sessions.filter((session) => session.sessionDate < bar.session_date && session.volume !== null).slice(-20);
      const volume = bar.volume == null ? null : Number(bar.volume);
      const manual = prior.length < 20 || volume === null
        ? null
        : volume / (prior.reduce((sum, session) => sum + (session.volume ?? 0), 0) / 20);
      const library = historicalDailyRvol(sessions, bar.session_date, volume, 20);
      rvolChecks.push({
        symbol,
        sessionDate: bar.session_date,
        priorSessions: prior.length,
        manual,
        library,
        agree: manual === library || (manual !== null && library !== null && Math.abs(manual - library) < 1e-9),
      });
    }
  }

  const metadata = deep[0]?.metadata;
  const checkpoint = metadata && typeof metadata === "object" ? (metadata as { checkpoint?: { deepReconstruction?: Array<{ tier: string }> } }).checkpoint : null;
  const deepTiers = (checkpoint?.deepReconstruction ?? []).map((item) => item.tier);
  const dailyRequests = requests.filter((request) => request.kind === "daily" || request.kind === "daily_page");
  const report = {
    database: "127.0.0.1:54329/historical_backfill_pilot",
    range: { from: DATE_FROM, to: DATE_TO },
    referenceNotes,
    firstPass,
    afterFirstRows: afterFirst[0]?.n,
    afterResumeRows: afterResume[0]?.n,
    resumeContinuedWithoutReset: afterFirst[0]?.n === afterResume[0]?.n,
    final: rest,
    replayStats,
    idempotencyMs,
    ingestMs,
    ingestWriteProfile,
    ingestProviderMs: ingestDailyRequests.reduce((sum, request) => sum + request.ms, 0),
    runtimeMs: Date.now() - startedAt,
    dailyCounts,
    duplicateKeys: duplicateKeys[0]?.n,
    episodeCounts,
    normalBySymbol,
    samples,
    deepTierCounts: deepTiers.reduce<Record<string, number>>((counts, tier) => {
      counts[tier] = (counts[tier] ?? 0) + 1;
      return counts;
    }, {}),
    deepHasNotable: deepTiers.includes("NOTABLE"),
    rvolChecks,
    requests,
    sizes,
    dailyRequestSummary: {
      count: dailyRequests.length,
      averageMs: dailyRequests.length === 0 ? null : Math.round(dailyRequests.reduce((sum, request) => sum + request.ms, 0) / dailyRequests.length),
      http403: dailyRequests.filter((request) => request.http === 403).length,
      http429: dailyRequests.filter((request) => request.http === 429).length,
      nextPages: dailyRequests.filter((request) => request.kind === "daily_page").length,
      downloadedRows: dailyRequests.reduce((sum, request) => sum + request.results, 0),
    },
  };
  writeFileSync(".shadow-review/pilot-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    firstPass: { state: firstPass.state, cursor: firstPass.cursorToken, rows: firstPass.rowsWritten },
    final: { state: rest.state, rows: rest.rowsWritten, duplicateRows: rest.duplicateRows, episodes: rest.episodesByTier },
    resumeContinuedWithoutReset: report.resumeContinuedWithoutReset,
    replay: { state: replayStats.state, rowsWritten: replayStats.rowsWritten, duplicateRows: replayStats.duplicateRows },
    dailyCounts,
    duplicateKeys: report.duplicateKeys,
    episodeCounts,
    normalBySymbol,
    samples,
    deepTierCounts: report.deepTierCounts,
    deepHasNotable: report.deepHasNotable,
    rvolChecks,
    dailyRequestSummary: report.dailyRequestSummary,
    referenceRequests: requests.filter((request) => request.kind !== "daily" && request.kind !== "daily_page").length,
    sizes,
    ingestMs,
    ingestWriteProfile,
    ingestProviderMs: report.ingestProviderMs,
    runtimeMs: report.runtimeMs,
    referenceNotes,
  }, null, 2));
  await sql.end();
  if (rest.state !== "COMPLETE" || report.duplicateKeys !== "0" || report.deepHasNotable) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "pilot failed";
  console.error(message);
  process.exit(1);
});
