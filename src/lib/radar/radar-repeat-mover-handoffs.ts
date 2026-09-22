import type { RadarRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-movers-types";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { SecurityId } from "@/types/security-identity";

/** Symbol-aware routes aligned with AI Analyst / dashboard conventions. */
export function buildRepeatMoverWorkflowHandoffs(
  symbol: string,
  securityId?: SecurityId | null,
): RadarRepeatMoverWorkflowHandoffs {
  const routes = workflowSymbolRoutes(symbol, { securityId: securityId ?? null });
  if (!routes) {
    const trimmed = symbol.trim().toUpperCase();
    const query = trimmed ? `?symbol=${encodeURIComponent(trimmed)}` : "";
    return {
      aiAnalyst: `/dashboard/ai${query}`,
      catalyst: `/dashboard/catalyst${query}`,
      watchlist: `/dashboard/watchlist${query}`,
      journal: `/dashboard/journal${query}`,
      actionCenter: "/dashboard/action-center",
    };
  }
  return {
    aiAnalyst: routes.ai,
    catalyst: routes.catalyst,
    watchlist: routes.watchlist,
    journal: routes.journal,
    actionCenter: routes.actionCenter,
  };
}
