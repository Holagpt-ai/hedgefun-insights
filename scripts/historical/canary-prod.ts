/**
 * Historical Intelligence V1 — production canary runner.
 *
 * Server-side only. Reads credentials from the environment and never prints them.
 * Uses the tested engine and the tested Postgres repositories. Does not manufacture
 * rows, does not change detector thresholds, and never fetches minute bars.
 */

import postgres from "postgres";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { createPolygonDailyAdapter } from "@/lib/historical-backfill/polygon-daily-adapter";
import { PostgresSecurityIdentityRepository } from "@/lib/security-identity/postgres-security-identity";
import { PostgresSecurityIntelligenceRepository } from "@/lib/security-intelligence/postgres-security-intelligence";
import type { SecurityType } from "@/config/security-identity.config";

const SYMBOLS = ["INTC", "OGN", "NWL", "AMD", "APA", "ALK", "AOS", "BEN", "BBY", "FMC"] as const;
const DATE_FROM = "2021-09-22";
const DATE_TO = "2026-09-18";
const POLYGON_BASE = "https://api.polygon.io";

const dbUrl = process.env.SUPABASE_DB_URL;
const apiKey = process.env.POLYGON_API_KEY;
if (!dbUrl) throw new Error("SUPABASE_DB_URL missing");
if (!apiKey) throw new Error("POLYGON_API_KEY missing");

const health = {
  dailyAggregateRequests: 0,
  referenceRequests: 0,
  pages: 0,
  paginatedFollowUps: 0,
  status403: 0,
  status429: 0,
  otherErrors: 0,
  retries: 0,
};

function withKey(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("apiKey", apiKey!);
  return parsed.toString();
}

function redact(message: string): string {
  return message.replaceAll(apiKey!, "[redacted]");
}

async function providerFetch(url: string, kind: "daily" | "reference"): Promise<unknown> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    if (kind === "daily") health.dailyAggregateRequests += 1;
    else health.referenceRequests += 1;
    let res: Response;
    try {
      res = await fetch(withKey(url));
    } catch (error) {
      health.otherErrors += 1;
      if (attempt > 3) throw new Error(redact(String(error)));
      health.retries += 1;
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    if (res.status === 403) health.status403 += 1;
    if (res.status === 429) health.status429 += 1;
    if (res.status === 429 || res.status >= 500) {
      if (attempt > 3) throw new Error(`provider status ${res.status}`);
      health.retries += 1;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      continue;
    }
    if (!res.ok && res.status !== 200) {
      health.otherErrors += 1;
      throw new Error(`provider status ${res.status}`);
    }
    if (kind === "daily") health.pages += 1;
    return await res.json();
  }
}

function mapSecurityType(raw: unknown): SecurityType {
  switch (raw) {
    case "CS": return "COMMON_STOCK";
    case "ADRC": return "ADR";
    case "ETF": return "ETF";
    case "PFD": return "PREFERRED";
    case "WARRANT": return "WARRANT";
    default: return "UNKNOWN";
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "full";
  const recordedAt = new Date().toISOString();
  const sql = postgres(dbUrl!, { max: 4, prepare: false, connect_timeout: 15 });
  const identity = new PostgresSecurityIdentityRepository(sql);
  const intelligence = new PostgresSecurityIntelligenceRepository(sql);

  const symbols = mode === "replay-intc" ? ["INTC"] : [...SYMBOLS];
  const identities: Array<{ symbol: string; securityId: string; status: string; created: boolean; reason: string }> = [];

  for (const symbol of symbols) {
    const payload = await providerFetch(`${POLYGON_BASE}/v3/reference/tickers/${symbol}`, "reference") as {
      results?: Record<string, unknown>;
    };
    const ref = payload.results ?? {};
    const resolution = await identity.resolve({
      symbol,
      exchange: typeof ref.primary_exchange === "string" ? ref.primary_exchange : null,
      effectiveDate: DATE_FROM,
      issuerName: typeof ref.name === "string" ? ref.name : null,
      securityType: mapSecurityType(ref.type),
      country: typeof ref.locale === "string" && ref.locale === "us" ? "US" : null,
      compositeFigi: typeof ref.composite_figi === "string" ? ref.composite_figi : null,
      figi: typeof ref.share_class_figi === "string" ? ref.share_class_figi : null,
      cik: typeof ref.cik === "string" ? ref.cik : null,
      source: "polygon-reference",
      provenance: "PROVIDER",
      recordedAt,
    });
    identities.push({
      symbol,
      securityId: resolution.securityId ?? "",
      status: resolution.status,
      created: resolution.created,
      reason: resolution.reason,
    });
    if (!resolution.securityId) throw new Error(`identity unresolved for ${symbol}: ${resolution.reason}`);
  }

  const provider = createPolygonDailyAdapter({
    fetchAggregates: (ticker, multiplier, timespan, from, to) => providerFetch(
      `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000`,
      "daily",
    ),
    fetchNextPage: (nextUrl) => {
      health.paginatedFollowUps += 1;
      return providerFetch(nextUrl, "daily");
    },
    verifiedEarliestDailyDate: DATE_FROM,
    sourceAsOf: recordedAt,
    fetchedAt: recordedAt,
  });

  const engine = new HistoricalBackfillEngine({
    identity,
    intelligence,
    provider,
    config: { verifiedEarliestDailyDate: DATE_FROM, maxConcurrentProviderRequests: 1 },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });

  const startedAtMs = Date.now();
  const started = await engine.start({
    securities: identities.map((row) => ({ securityId: row.securityId })),
    completedSessionDate: DATE_TO,
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    recordedAt,
    jobType: mode === "replay-intc" ? "SECURITY_DAILY_HISTORY_CANARY_REPLAY" : "SECURITY_DAILY_HISTORY_CANARY",
  });
  if (!started.ok) throw new Error(`job start failed: ${started.reason}`);
  const jobId = started.record.jobId;
  console.log(JSON.stringify({ event: "job_started", jobId, mode }));

  let stats = await engine.stats(jobId, new Date().toISOString());
  let rounds = 0;
  while (stats.state === "RUNNING" || rounds === 0) {
    stats = await engine.runBatch(jobId, new Date().toISOString());
    rounds += 1;
    console.log(JSON.stringify({
      event: "batch",
      rounds,
      state: stats.state,
      cursorDate: stats.cursorDate,
      cursorToken: stats.cursorToken,
      securitiesProcessed: stats.securitiesProcessed,
      rowsWritten: stats.rowsWritten,
      duplicateRows: stats.duplicateRows,
      invalidRows: stats.invalidRows,
      providerErrors: stats.providerErrors,
      episodesByTier: stats.episodesByTier,
      coverage: stats.coverage,
    }));
    if (stats.state !== "RUNNING") break;
    if (rounds > 2000) throw new Error("run did not converge");
  }

  const summary = {
    event: "done",
    mode,
    jobId,
    identities,
    finalState: stats.state,
    rowsWritten: stats.rowsWritten,
    duplicateRows: stats.duplicateRows,
    invalidRows: stats.invalidRows,
    sessionsProcessed: stats.sessionsProcessed,
    providerErrors: stats.providerErrors,
    episodesByTier: stats.episodesByTier,
    deepReconstruction: stats.deepReconstruction.length,
    deepReconstructionTiers: stats.deepReconstruction.reduce<Record<string, number>>((acc, item) => {
      acc[item.tier] = (acc[item.tier] ?? 0) + 1;
      return acc;
    }, {}),
    coverage: stats.coverage,
    runtimeMs: Date.now() - startedAtMs,
    providerHealth: health,
  };
  console.log(JSON.stringify(summary, null, 2));
  await sql.end();
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
