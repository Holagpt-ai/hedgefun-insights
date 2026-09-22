import { symbolRoutes } from "@/lib/pre-market/builders";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import { mergeWorkflowSource } from "@/lib/historical-workflow/build-historical-workflow-context";
import type { HistoricalWorkflowSource } from "@/lib/historical-workflow/historical-workflow-types";
import {
  persistHistoricalWorkflowContext,
  readHistoricalWorkflowContext,
} from "@/lib/historical-workflow/workflow-handoff-storage";
import type { SecurityId } from "@/types/security-identity";

export interface WorkflowSymbolRoutes {
  symbol: string;
  ai: string;
  catalyst: string;
  watchlist: string;
  journal: string;
  chart: string;
  stock: string;
  actionCenter: string;
}

function queryForSymbol(symbol: string, securityId: SecurityId | null | undefined): string {
  const params = new URLSearchParams({ symbol });
  if (securityId) params.set("securityId", securityId);
  return params.toString();
}

/** Symbol-aware routes with optional permanent securityId on the query string. */
export function workflowSymbolRoutes(
  rawSymbol: string,
  hint?: Partial<Pick<HistoricalWorkflowContext, "securityId" | "symbol">> | null,
): WorkflowSymbolRoutes | null {
  const base = symbolRoutes(rawSymbol);
  if (!base) return null;

  const session = readHistoricalWorkflowContext(base.symbol);
  const securityId = hint?.securityId ?? session?.securityId ?? null;
  const q = queryForSymbol(base.symbol, securityId);

  return {
    symbol: base.symbol,
    ai: `/dashboard/ai?${q}`,
    catalyst: `/dashboard/catalyst?${q}`,
    watchlist: `/dashboard/watchlist?${q}`,
    journal: `/dashboard/journal?${q}`,
    chart: base.chart,
    stock: base.stock,
    actionCenter: "/dashboard/action-center",
  };
}

/** Refresh handoff timestamp / source before navigation (no refetch). */
export function touchWorkflowHandoff(
  symbol: string,
  sourceSurface: HistoricalWorkflowSource,
): void {
  const existing = readHistoricalWorkflowContext(symbol);
  if (!existing) return;
  persistHistoricalWorkflowContext(mergeWorkflowSource(existing, sourceSurface));
}

export function buildInboxWorkflowNavigatePath(
  surface: "ai" | "catalyst" | "journal" | "watchlist" | "screeners",
  symbol: string,
): string | null {
  const routes = workflowSymbolRoutes(symbol);
  if (!routes) return null;
  touchWorkflowHandoff(symbol, "inbox");
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
