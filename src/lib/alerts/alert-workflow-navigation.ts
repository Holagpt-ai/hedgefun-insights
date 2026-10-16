import { opportunityWorkflowPaths } from "@/lib/scanner-intelligence/workflow-routes";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";

/** Price-alert toast → symbol-aware Action Center (not raw chat context). */
export function priceAlertToastViewPath(symbol: string): string {
  const routes = workflowSymbolRoutes(symbol);
  if (routes) return routes.actionCenter;
  const trimmed = symbol.trim().toUpperCase();
  return `/dashboard/action-center?symbol=${encodeURIComponent(trimmed)}`;
}

function appendQueryParam(path: string, key: string, value: string): string {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}${key}=${encodeURIComponent(value)}`;
}

/** Scanner intelligence toast → Action Center with event identity when known. */
export function scannerAlertToastViewPath(input: {
  symbol: string;
  event_type: string;
  event_at?: string | null;
}): string {
  const paths = opportunityWorkflowPaths(input.symbol, input.event_type);
  let path = paths?.action_center ?? priceAlertToastViewPath(input.symbol);
  const at = input.event_at?.trim();
  if (at) path = appendQueryParam(path, "event_at", at);
  return path;
}
