import type { Sql } from "postgres";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoricalIdentityPort, HistoricalIntelligencePort } from "@/lib/historical-backfill/engine";
import {
  loadDotEnvFiles,
  openProductionSql,
  requireProductionDatabaseUrl,
} from "@/lib/persistence/production-database";
import {
  createProductionSupabaseClient,
  requireProductionSupabaseServerKey,
  requireProductionSupabaseUrl,
} from "@/lib/persistence/supabase-server";
import { PostgresSecurityIdentityRepository } from "@/lib/security-identity/postgres-security-identity";
import { SupabaseSecurityIdentityRepository } from "@/lib/security-identity/supabase-security-identity";
import { PostgresSecurityIntelligenceRepository } from "@/lib/security-intelligence/postgres-security-intelligence";
import { SupabaseSecurityIntelligenceRepository } from "@/lib/security-intelligence/supabase-security-intelligence";

export type HistoricalPersistenceTransport = "postgres" | "supabase";

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

function hasProductionSupabaseCredentials(): boolean {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SECRET_KEY
    ?? ""
  ).trim();
  return url.length > 0 && key.length > 0;
}

export function resolveHistoricalPersistenceTransport(): HistoricalPersistenceTransport {
  if (hasDirectProductionDatabaseUrl()) return "postgres";
  if (hasProductionSupabaseCredentials()) return "supabase";
  throw new Error(
    "Historical production persistence requires HISTORICAL_PRODUCTION_DATABASE_URL or SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY",
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

function supabaseRolloutQueries(supabase: SupabaseClient): HistoricalRolloutQueries {
  return {
    async findInterruptedJob(dateFrom, dateTo) {
      const { data, error } = await supabase.rpc("historical_find_interrupted_backfill_job", {
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : null;
      if (!row || typeof row !== "object") return null;
      const record = row as { job_id?: string; state?: string };
      return record.job_id && record.state ? { jobId: record.job_id, state: record.state } : null;
    },
    async loadBackfilledSymbols(dateFrom, dateTo, minSessions) {
      const { data, error } = await supabase.rpc("historical_rollout_backfilled_symbols", {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_min_sessions: minSessions,
      });
      if (error) throw new Error(error.message);
      const symbols = Array.isArray(data)
        ? data.map((row) => (typeof row === "object" && row && "symbol" in row ? String((row as { symbol: string }).symbol) : ""))
        : [];
      return new Set(symbols.filter(Boolean));
    },
    async loadEligibleSymbols(backfilled, canarySymbols) {
      const { data, error } = await supabase
        .from("ticker_search")
        .select("symbol")
        .eq("active", true)
        .eq("type", "CS")
        .order("symbol");
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((row) => String(row.symbol))
        .filter((symbol) => !canarySymbols.has(symbol) && !backfilled.has(symbol));
    },
  };
}

export function createHistoricalPersistence(options: { loadLocalEnv?: boolean } = {}): HistoricalPersistence {
  if (options.loadLocalEnv) loadDotEnvFiles();
  const transport = resolveHistoricalPersistenceTransport();
  if (transport === "postgres") {
    const sql = openProductionSql(requireProductionDatabaseUrl());
    return {
      transport,
      identity: new PostgresSecurityIdentityRepository(sql),
      intelligence: new PostgresSecurityIntelligenceRepository(sql),
      rollout: postgresRolloutQueries(sql),
      close: async () => { await sql.end(); },
    };
  }
  requireProductionSupabaseUrl();
  requireProductionSupabaseServerKey();
  const supabase = createProductionSupabaseClient();
  return {
    transport,
    identity: new SupabaseSecurityIdentityRepository(supabase),
    intelligence: new SupabaseSecurityIntelligenceRepository(supabase),
    rollout: supabaseRolloutQueries(supabase),
    close: async () => {},
  };
}
