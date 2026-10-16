import { opportunityWorkflowPaths } from "@/lib/scanner-intelligence/workflow-routes";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";

/** Price-alert toast → symbol-aware Action Center (not raw chat context). */
export function priceAlertToastViewPath(symbol: string): string {
  const routes = workflowSymbolRoutes(symbol);
  if (routes) return routes.actionCenter;
  const trimmed = symbol.trim().toUpperCase();
  return `/dashboard/action-center?symbol=${encodeURIComponent(trimmed)}`;
}

/** Scanner intelligence toast → Action Center with event identity when known. */
export function scannerAlertToastViewPath(input: {
  symbol: string;
  event_type: string;
}): string {
  const paths = opportunityWorkflowPaths(input.symbol, input.event_type);
  if (paths) return paths.action_center;
  return priceAlertToastViewPath(input.symbol);
}
