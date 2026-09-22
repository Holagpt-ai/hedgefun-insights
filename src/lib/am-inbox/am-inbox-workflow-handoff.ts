import {
  buildInboxWorkflowNavigatePath,
  touchWorkflowHandoff,
  workflowSymbolRoutes,
} from "@/lib/historical-workflow/workflow-symbol-routes";
import type { SecurityId } from "@/types/security-identity";

export function amInboxWorkflowRoutes(symbol: string, securityId?: SecurityId | null) {
  return workflowSymbolRoutes(symbol, { securityId: securityId ?? null });
}

export function amInboxNavigatePath(
  surface: "ai" | "catalyst" | "journal" | "watchlist" | "screeners" | "action_center",
  symbol: string,
  securityId?: SecurityId | null,
): string | null {
  if (surface === "action_center") {
    touchWorkflowHandoff(symbol, "inbox");
    return "/dashboard/action-center";
  }
  touchWorkflowHandoff(symbol, "inbox");
  if (securityId) {
    const routes = workflowSymbolRoutes(symbol, { securityId });
    if (!routes) return buildInboxWorkflowNavigatePath(surface === "screeners" ? "screeners" : surface, symbol);
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
        return "/dashboard/screeners";
      default:
        return null;
    }
  }
  return buildInboxWorkflowNavigatePath(surface === "screeners" ? "screeners" : surface, symbol);
}
