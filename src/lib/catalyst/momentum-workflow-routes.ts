import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import { normalizeSymbol } from "@/lib/catalyst/parsers";

/** Symbol-aware routes for Radar ↔ Catalyst trader discovery (query handoffs only). */
export function momentumWorkflowRoutes(rawSymbol: string) {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) return null;
  const base = workflowSymbolRoutes(symbol);
  const q = `symbol=${encodeURIComponent(symbol)}`;
  return {
    symbol,
    ai: base?.ai ?? `/dashboard/ai?${q}`,
    catalyst: base?.catalyst ?? `/dashboard/catalyst?${q}`,
    watchlist: base?.watchlist ?? `/dashboard/watchlist?${q}`,
    journal: base?.journal ?? `/dashboard/journal?${q}`,
    actionCenter: base?.actionCenter ?? `/dashboard/action-center?${q}`,
    screeners: `/dashboard/screeners?${q}`,
    momentumRadar: `/dashboard/screeners?${q}`,
  };
}
