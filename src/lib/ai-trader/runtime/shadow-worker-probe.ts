import type { MarketIntelligenceAdapter } from "@/lib/ai-trader/market/intelligence-adapter";
import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type { SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { watchlistTransitionRpcAvailable } from "@/lib/ai-trader/persistence/watchlist-transition-rpc";
import { evaluateShadowReadiness, type ShadowReadinessInput } from "@/lib/ai-trader/runtime/readiness";
import { resolveAiTraderMarketSession } from "@/lib/ai-trader/runtime/market-session-policy";
import { readOperatingModeFromDatabase } from "@/lib/ai-trader/runtime/operating-mode-reader";
import type { ShadowPersistence } from "@/lib/ai-trader/runtime/shadow-persistence";
import {
  classifyShadowWorkerReadiness,
  type ShadowWorkerProbe,
  type ShadowWorkerReadinessState,
} from "@/lib/ai-trader/runtime/shadow-worker-supervisor";

export interface ShadowWorkerProbeResult extends ShadowWorkerProbe {
  readinessInput: ShadowReadinessInput | null;
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function closedProbe(state: ShadowWorkerReadinessState, databaseReachable: boolean): ShadowWorkerProbeResult {
  return {
    state,
    infrastructureReady: false,
    mode: null,
    databaseReachable,
    reasons: [state],
    readinessInput: null,
  };
}

export async function probeShadowWorkerDatabase(deps: {
  executor: SqlExecutor;
  marketAdapter: MarketIntelligenceAdapter;
  persistence: ShadowPersistence;
  nowMs?: number;
}): Promise<ShadowWorkerProbeResult> {
  try {
    await deps.executor.query("SELECT 1 AS ok");
  } catch {
    return closedProbe("DATABASE_UNAVAILABLE", false);
  }

  try {
    const rows = await deps.executor.query<{ runtime_present: unknown; watchlist_present: unknown }>(
      `SELECT (to_regclass('public.ai_trader_runtime') IS NOT NULL) AS runtime_present,
              (to_regclass('public.ai_trader_watchlist_items') IS NOT NULL) AS watchlist_present`,
    );
    const runtimeSchemaPresent = asBool(rows[0]?.runtime_present);
    const watchlistSchemaPresent = asBool(rows[0]?.watchlist_present);
    const transitionRpcPresent = await watchlistTransitionRpcAvailable(deps.executor);
    let mode: AiTraderOperatingMode | null = null;
    let operatingModeReadable = false;
    if (runtimeSchemaPresent) {
      try {
        mode = await readOperatingModeFromDatabase(deps.executor);
        operatingModeReadable = true;
      } catch {
        operatingModeReadable = false;
      }
    }
    let sessionPolicyAvailable = false;
    try {
      sessionPolicyAvailable = resolveAiTraderMarketSession(deps.nowMs ?? Date.now()) !== "UNKNOWN";
    } catch {
      sessionPolicyAvailable = false;
    }
    const readinessInput: ShadowReadinessInput = {
      runtimeSchemaPresent,
      watchlistSchemaPresent,
      marketAdapter: deps.marketAdapter,
      sessionPolicyAvailable,
      persistence: deps.persistence,
      operatingModeReadable,
      transitionRpcPresent,
    };
    const evaluated = evaluateShadowReadiness(readinessInput);
    const state = classifyShadowWorkerReadiness(evaluated, mode, true);
    return {
      state,
      infrastructureReady: state === "READY" || state === "OPERATING_MODE_OFF",
      mode,
      databaseReachable: true,
      reasons: evaluated.reasons,
      readinessInput,
    };
  } catch {
    return closedProbe("RUNTIME_STATE_UNAVAILABLE", true);
  }
}
