import { createClient } from "@supabase/supabase-js";
import { createStocksistMarketIntelligenceAdapter } from "@/lib/ai-trader/market/stocksist-intelligence-adapter";
import { createSqlShadowPersistence } from "@/lib/ai-trader/persistence/shadow-store";
import { openProductionSql, requireProductionDatabaseUrl } from "@/lib/persistence/production-database";
import { loadAmRadarShadowFeeds } from "@/lib/radar-am-shadow/fetch";
import type { ShadowWorkerConfig } from "@/lib/ai-trader/runtime/env-contract";
import type { ShadowRuntimeLogger } from "@/lib/ai-trader/runtime/logger";
import { readOperatingModeFromDatabase } from "@/lib/ai-trader/runtime/operating-mode-reader";
import { createPostgresQueryExecutor } from "@/lib/ai-trader/runtime/postgres-query-executor";
import { probeShadowWorkerDatabase } from "@/lib/ai-trader/runtime/shadow-worker-probe";
import { runShadowWorkerBootstrap } from "@/lib/ai-trader/runtime/shadow-worker-bootstrap";
import type { ShadowWorkerHost } from "@/lib/ai-trader/runtime/shadow-worker-supervisor";

export interface ConnectedShadowWorker {
  host: ShadowWorkerHost;
  close(): Promise<void>;
}

/**
 * Wires the existing Shadow runtime to production Postgres and the service-role Supabase client.
 * Does not change operating mode and does not call a model or broker.
 */
export async function openProductionShadowWorker(
  config: ShadowWorkerConfig,
  logger: ShadowRuntimeLogger,
  env: NodeJS.Dict<string> = process.env,
): Promise<ConnectedShadowWorker> {
  const databaseUrl = requireProductionDatabaseUrl(env);
  const sql = openProductionSql(databaseUrl);
  const executor = createPostgresQueryExecutor(sql);
  const persistence = createSqlShadowPersistence(executor);
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const marketAdapter = createStocksistMarketIntelligenceAdapter(async () => {
    const feeds = await loadAmRadarShadowFeeds(supabase);
    if (feeds.v22Error) {
      throw new Error("MARKET_ADAPTER_UNAVAILABLE");
    }
    return {
      radarState: feeds.v22RawState,
      radarBoard: feeds.v22RawRows ?? [],
    };
  });

  const host: ShadowWorkerHost = {
    async probe() {
      const result = await probeShadowWorkerDatabase({ executor, marketAdapter, persistence });
      return result;
    },
    async runCycle() {
      const result = await probeShadowWorkerDatabase({ executor, marketAdapter, persistence });
      if (!result.infrastructureReady || !result.readinessInput) {
        return {
          status: "FAILED",
          reason: result.state,
          cycleId: "not-ready",
          observedCandidateCount: 0,
          eligibleCandidateCount: 0,
          discoveredCount: 0,
          transitionedCount: 0,
          removedCount: 0,
          contextSnapshotsWritten: 0,
          observationsWritten: 0,
          errors: [{ scope: "SYSTEMIC", code: result.state, message: result.state }],
        };
      }
      return runShadowWorkerBootstrap(
        {
          readOperatingMode: () => readOperatingModeFromDatabase(executor),
          marketAdapter,
          persistence,
          logger,
          workerId: config.workerId,
        },
        result.readinessInput,
        { allowExecute: true },
      );
    },
  };

  return {
    host,
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
