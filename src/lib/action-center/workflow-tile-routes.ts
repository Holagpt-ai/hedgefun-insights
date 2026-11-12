import {
  workflowSymbolRoutes,
  type WorkflowSymbolRoutes,
} from "@/lib/historical-workflow/workflow-symbol-routes";

const SYMBOL_TILE_ROUTE: Partial<Record<string, keyof WorkflowSymbolRoutes>> = {
  "/dashboard/screeners": "screeners",
  "/dashboard/catalyst": "catalyst",
  "/dashboard/watchlist": "watchlist",
  "/dashboard/ai": "ai",
  "/dashboard/journal": "journal",
};

/** Preserve scanner handoff symbol (and session securityId) on Continue Workflow tiles. */
export function actionCenterWorkflowTileHref(
  genericRoute: string,
  symbol: string | null | undefined,
): string {
  if (!symbol?.trim()) return genericRoute;
  const key = SYMBOL_TILE_ROUTE[genericRoute];
  if (!key) return genericRoute;
  const routes = workflowSymbolRoutes(symbol);
  if (!routes) return genericRoute;
  return routes[key];
}
