import { authGatedHref } from "@/lib/auth/auth-return-url";
import { symbolRoutes } from "@/lib/pre-market/builders";

export type PublicWorkflowTarget =
  | "catalyst"
  | "watchlist"
  | "screeners"
  | "action_center"
  | "chart"
  | "stock";

export function publicWorkflowHref(
  symbol: string,
  target: PublicWorkflowTarget,
  authenticated: boolean,
): string | null {
  const routes = symbolRoutes(symbol);
  if (!routes) return null;
  switch (target) {
    case "catalyst":
      return authGatedHref(routes.catalyst, authenticated);
    case "watchlist":
      return authGatedHref(routes.watchlist, authenticated);
    case "screeners":
      return authenticated ? "/dashboard/screeners" : "/screener";
    case "action_center":
      return authGatedHref(`/dashboard/action-center?symbol=${encodeURIComponent(routes.symbol)}`, authenticated);
    case "chart":
      return routes.chart;
    case "stock":
      return routes.stock;
    default:
      return null;
  }
}

export function publicStockDetailPath(symbol: string): string {
  const routes = symbolRoutes(symbol);
  return routes?.stock ?? `/stocks/${encodeURIComponent(symbol.trim().toUpperCase())}`;
}

/** Dashboard watchlist entry (no symbol context). */
export function publicWatchlistEntryHref(authenticated: boolean): string {
  return authGatedHref("/dashboard/watchlist", authenticated);
}

/** Historical Radar / screener focus for a symbol (auth-gated for guests). */
export function publicHistoricalRadarHref(symbol: string, authenticated: boolean): string | null {
  const routes = symbolRoutes(symbol);
  if (!routes) return null;
  const dest = `/dashboard/screeners?symbol=${encodeURIComponent(routes.symbol)}&focus=historical`;
  return authGatedHref(dest, authenticated);
}

export function publicChartPath(symbol: string): string | null {
  const routes = symbolRoutes(symbol);
  return routes?.chart ?? null;
}
