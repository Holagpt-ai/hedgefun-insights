import type { Sql } from "postgres";
import type { HistoricalIdentityPort, HistoricalIntelligencePort } from "@/lib/historical-backfill/engine";
import {
  HistoricalBridgeClient,
  requireHistoricalBridgeConfig,
} from "@/lib/persistence/historical-bridge-client";
import {
  loadDotEnvFiles,
  openProductionSql,
  requireProductionDatabaseUrl,
} from "@/lib/persistence/production-database";
import { BridgeSecurityIdentityRepository } from "@/lib/security-identity/bridge-security-identity";
import { PostgresSecurityIdentityRepository } from "@/lib/security-identity/postgres-security-identity";
import { BridgeSecurityIntelligenceRepository } from "@/lib/security-intelligence/bridge-security-intelligence";
import { PostgresSecurityIntelligenceRepository } from "@/lib/security-intelligence/postgres-security-intelligence";

export type HistoricalPersistenceTransport = "bridge" | "postgres";

export interface HistoricalIdentityRepository extends HistoricalIdentityPort {
  resolve: PostgresSecurityIdentityRepository["resolve"];
  listIdentifiers: PostgresSecurityIdentityRepository["listIdentifiers"];
}

export interface HistoricalPersistence {
  transport: HistoricalPersistenceTransport;
  identity: HistoricalIdentityRepository;
  intelligence: HistoricalIntelligencePort & {
    transaction<T>(fn: () => Promise<T>): Promise<T>;
    getJob(jobId: string): ReturnType<PostgresSecurityIntelligenceRepository["getJob"]>;
  };
  rollout: HistoricalRolloutQueries;
  close(): Promise<void>;
}

export interface HistoricalRolloutQueries {
  findInterruptedJob(dateFrom: string, dateTo: string): Promise<{ jobId: string; state: string } | null>;
  loadBackfilledSymbols(dateFrom: string, dateTo: string, minSessions: number): Promise<Set<string>>;
  loadEligibleSymbols(backfilled: Set<string>, canarySymbols: ReadonlySet<string>): Promise<string[]>;
}

function hasBridgeCredentials(): boolean {
  const bridgeUrl = (process.env.RADAR_BRIDGE_URL ?? "").trim();
  const workerSecret = (process.env.RADAR_WORKER_SECRET ?? "").trim();
  return bridgeUrl.length > 0 && workerSecret.length > 0;
}

function hasDirectProductionDatabaseUrl(): boolean {
  const url = (
    process.env.HISTORICAL_PRODUCTION_DATABASE_URL
    ?? process.env.LOVABLE_DB_MIGRATION_URL
    ?? process.env.SUPABASE_DB_URL
    ?? process.env.DATABASE_URL
    ?? ""
  ).trim();
  return url.length > 0;
}

export function resolveHistoricalPersistenceTransport(): HistoricalPersistenceTransport {
  if (hasBridgeCredentials()) return "bridge";
  if (hasDirectProductionDatabaseUrl()) return "postgres";
  throw new Error(
    "Historical production persistence requires RADAR_BRIDGE_URL with RADAR_WORKER_SECRET or HISTORICAL_PRODUCTION_DATABASE_URL",
  );
}

function postgresRolloutQueries(sql: Sql): HistoricalRolloutQueries {
  return {
    async findInterruptedJob(dateFrom, dateTo) {
      const rows = await sql<{ job_id: string; state: string }[]>`
        select job_id, state
        from public.security_backfill_jobs
        where state in ('RUNNING', 'PAUSED', 'FAILED')
          and date_from = ${dateFrom}
          and date_to = ${dateTo}
        order by updated_at desc
        limit 1
      `;
      return rows[0] ? { jobId: rows[0].job_id, state: rows[0].state } : null;
    },
    async loadBackfilledSymbols(dateFrom, dateTo, minSessions) {
      const rows = await sql<{ symbol: string }[]>`
        select s.current_symbol as symbol
        from public.securities s
        inner join (
          select security_id, count(*)::int as n
          from public.security_daily_history
          where session_date >= ${dateFrom} and session_date <= ${dateTo}
          group by security_id
        ) h on h.security_id = s.security_id
        where h.n >= ${minSessions}
      `;
      return new Set(rows.map((row) => row.symbol));
    },
    async loadEligibleSymbols(backfilled, canarySymbols) {
      const rows = await sql<{ symbol: string }[]>`
        select symbol from public.ticker_search
        where active is true and type = 'CS'
        order by symbol
      `;
      return rows
        .map((row) => row.symbol)
        .filter((symbol) => !canarySymbols.has(symbol) && !backfilled.has(symbol));
    },
  };
}

function bridgeRolloutQueries(bridge: HistoricalBridgeClient): HistoricalRolloutQueries {
  return {
    async findInterruptedJob(dateFrom, dateTo) {
      const res = await bridge.call("historical_find_interrupted_job", {
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      const rows = Array.isArray(res.result) ? res.result as Record<string, unknown>[] : [];
      const row = rows[0];
      if (!row?.job_id || !row?.state) return null;
      return { jobId: String(row.job_id), state: String(row.state) };
    },
    async loadBackfilledSymbols(dateFrom, dateTo, minSessions) {
      const res = await bridge.call("historical_rollout_backfilled_symbols", {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_min_sessions: minSessions,
      });
      const rows = Array.isArray(res.result) ? res.result as Record<string, unknown>[] : [];
      return new Set(rows.map((row) => String(row.symbol)).filter(Boolean));
    },
    async loadEligibleSymbols(backfilled, canarySymbols) {
      const rows = await bridge.fetchAllRows("historical_list_eligible_symbols", {});
      return rows
        .map((row) => String(row.symbol))
        .filter((symbol) => !canarySymbols.has(symbol) && !backfilled.has(symbol));
    },
  };
}

export function createHistoricalPersistence(options: { loadLocalEnv?: boolean } = {}): HistoricalPersistence {
  if (options.loadLocalEnv) loadDotEnvFiles();
  const transport = resolveHistoricalPersistenceTransport();
  if (transport === "bridge") {
    const config = requireHistoricalBridgeConfig();
    const bridge = new HistoricalBridgeClient(config);
    return {
      transport,
      identity: new BridgeSecurityIdentityRepository(bridge),
      intelligence: new BridgeSecurityIntelligenceRepository(bridge),
      rollout: bridgeRolloutQueries(bridge),
      close: async () => {},
    };
  }
  const sql = openProductionSql(requireProductionDatabaseUrl());
  return {
    transport,
    identity: new PostgresSecurityIdentityRepository(sql),
    intelligence: new PostgresSecurityIntelligenceRepository(sql),
    rollout: postgresRolloutQueries(sql),
    close: async () => { await sql.end(); },
  };
}
