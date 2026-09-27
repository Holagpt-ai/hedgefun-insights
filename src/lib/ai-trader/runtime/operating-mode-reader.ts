import type { Database } from "@/integrations/supabase/types";
import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type { SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { isUndefinedTableError, MemoryPersistenceError } from "@/lib/ai-trader/persistence/executor";

type RuntimeRow = Database["public"]["Tables"]["ai_trader_runtime"]["Row"];

const MODES: readonly AiTraderOperatingMode[] = [
  "OFF",
  "BACKTEST",
  "SHADOW",
  "PAPER",
  "CONTROLLED_LIVE",
  "LIVE",
];

export async function readOperatingModeFromDatabase(executor: SqlExecutor): Promise<AiTraderOperatingMode> {
  try {
    const rows = await executor.query<RuntimeRow>(
      `SELECT operating_mode FROM public.ai_trader_runtime WHERE id = 1 LIMIT 1`,
    );
    const mode = rows[0]?.operating_mode;
    if (typeof mode === "string" && (MODES as readonly string[]).includes(mode)) {
      return mode as AiTraderOperatingMode;
    }
    throw new MemoryPersistenceError("NOT_SUPPORTED_YET", "ai_trader_runtime.operating_mode is missing or invalid");
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new MemoryPersistenceError("TABLES_NOT_APPLIED", "ai_trader_runtime is not applied");
    }
    throw error;
  }
}
