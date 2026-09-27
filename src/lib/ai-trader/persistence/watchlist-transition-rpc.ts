import {
  parseWatchlistTransitionRpcResult,
  toWatchlistTransitionRpcPayload,
  WATCHLIST_TRANSITION_RPC_NAME,
  type WatchlistTransitionRpcInput,
  type WatchlistTransitionRpcResult,
} from "@/lib/ai-trader/domain/watchlist-transition-rpc";
import {
  isUndefinedFunctionError,
  isUndefinedTableError,
  MemoryPersistenceError,
  type SqlExecutor,
} from "@/lib/ai-trader/persistence/executor";

export async function applyWatchlistTransitionRpc(
  executor: SqlExecutor,
  input: WatchlistTransitionRpcInput,
): Promise<WatchlistTransitionRpcResult> {
  try {
    const rows = await executor.query<{ result?: unknown; ai_trader_apply_watchlist_transition_v1?: unknown }>(
      `SELECT public.${WATCHLIST_TRANSITION_RPC_NAME}($1::jsonb) AS result`,
      [JSON.stringify(toWatchlistTransitionRpcPayload(input))],
    );
    return parseWatchlistTransitionRpcResult(rows[0]?.result ?? rows[0]?.ai_trader_apply_watchlist_transition_v1);
  } catch (error) {
    if (isUndefinedFunctionError(error)) {
      throw new MemoryPersistenceError(
        "RPC_NOT_APPLIED",
        "ai_trader_apply_watchlist_transition_v1 is not applied. Shadow writes must wait.",
      );
    }
    if (isUndefinedTableError(error)) {
      throw new MemoryPersistenceError("TABLES_NOT_APPLIED", "AI Trader watchlist tables are not applied.");
    }
    throw error;
  }
}

export async function watchlistTransitionRpcAvailable(executor: SqlExecutor): Promise<boolean> {
  try {
    const rows = await executor.query<{ present?: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = $1
       ) AS present`,
      [WATCHLIST_TRANSITION_RPC_NAME],
    );
    return rows[0]?.present === true;
  } catch {
    return false;
  }
}
