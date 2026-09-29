import { canonicalIntelligenceEventType } from "@/lib/scanner-intelligence/event-model";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { SecurityId } from "@/types/security-identity";

export type OpportunityWorkflowSurface =
  | "ai"
  | "catalyst"
  | "journal"
  | "watchlist"
  | "screeners"
  | "action_center";

function withEvent(path: string, eventType: string | null): string {
  const event = canonicalIntelligenceEventType(eventType);
  if (!event) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}event=${encodeURIComponent(event)}`;
}

/**
 * Symbol-aware handoff paths. Event context is a single known event type,
 * not an encoded payload. Unknown event values are omitted.
 */
export function opportunityWorkflowPaths(
  symbol: string,
  eventType: string | null = null,
  securityId: SecurityId | null = null,
): Record<OpportunityWorkflowSurface, string> | null {
  const routes = workflowSymbolRoutes(symbol, { securityId });
  if (!routes) return null;
  const symbolQuery = `symbol=${encodeURIComponent(routes.symbol)}`;
  return {
    ai: withEvent(routes.ai, eventType),
    catalyst: withEvent(routes.catalyst, eventType),
    journal: withEvent(routes.journal, eventType),
    watchlist: routes.watchlist,
    screeners: withEvent(`/dashboard/screeners?${symbolQuery}`, eventType),
    action_center: withEvent(`/dashboard/action-center?${symbolQuery}`, eventType),
  };
}
