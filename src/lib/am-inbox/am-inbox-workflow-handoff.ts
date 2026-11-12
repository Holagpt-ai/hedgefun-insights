import { touchWorkflowHandoff, workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { SecurityId } from "@/types/security-identity";

export function amInboxWorkflowRoutes(symbol: string, securityId?: SecurityId | null) {
  return workflowSymbolRoutes(symbol, { securityId: securityId ?? null });
}

export function amInboxNavigatePath(
  surface: "ai" | "catalyst" | "journal" | "watchlist" | "screeners" | "action_center",
  symbol: string,
  securityId?: SecurityId | null,
): string | null {
  touchWorkflowHandoff(symbol, "inbox");
  const routes = workflowSymbolRoutes(symbol, { securityId: securityId ?? null });
  if (!routes) return null;
  switch (surface) {
    case "ai":
      return routes.ai;
    case "catalyst":
      return routes.catalyst;
    case "journal":
      return routes.journal;
    case "watchlist":
      return routes.watchlist;
    case "screeners":
      return routes.screeners;
    case "action_center":
      return routes.actionCenter;
    default:
      return null;
  }
}
