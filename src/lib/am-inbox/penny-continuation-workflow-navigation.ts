/**
 * Penny Continuation navigation — verified securityId from AM Inbox row only.
 * Does not read browser workflow session storage (avoids stale cross-symbol IDs).
 */

import { symbolRoutes } from "@/lib/pre-market/builders";
import type { WorkflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { AmInboxPennyBadgeMatchTarget } from "@/lib/am-inbox/penny-continuation-workflow-types";
import type { SecurityId } from "@/types/security-identity";

function queryForSymbol(symbol: string, verifiedSecurityId: SecurityId | null): string {
  const params = new URLSearchParams({ symbol });
  if (verifiedSecurityId !== null) {
    params.set("securityId", verifiedSecurityId);
  }
  return params.toString();
}

export function pennyContinuationWorkflowRoutes(
  target: Pick<AmInboxPennyBadgeMatchTarget, "symbol" | "securityId">,
): WorkflowSymbolRoutes | null {
  const base = symbolRoutes(target.symbol);
  if (!base) return null;

  const verifiedSecurityId: SecurityId | null = target.securityId ?? null;
  const q = queryForSymbol(base.symbol, verifiedSecurityId);

  return {
    symbol: base.symbol,
    ai: `/dashboard/ai?${q}`,
    catalyst: `/dashboard/catalyst?${q}`,
    watchlist: `/dashboard/watchlist?${q}`,
    journal: `/dashboard/journal?${q}`,
    chart: base.chart,
    stock: base.stock,
    actionCenter: `/dashboard/action-center?${q}`,
    screeners: `/dashboard/screeners?${q}`,
  };
}

export function pennyContinuationNavigatePath(
  surface: "ai" | "catalyst" | "journal" | "watchlist" | "screeners" | "action_center",
  target: Pick<AmInboxPennyBadgeMatchTarget, "symbol" | "securityId">,
): string | null {
  if (surface === "action_center") {
    return "/dashboard/action-center";
  }
  if (surface === "screeners") {
    return "/dashboard/screeners";
  }
  const routes = pennyContinuationWorkflowRoutes(target);
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
    default:
      return null;
  }
}
