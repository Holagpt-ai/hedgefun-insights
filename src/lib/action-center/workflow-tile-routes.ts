import { readScannerHandoffQuery } from "@/components/scanner-intelligence/ScannerHandoffBanner";
import {
  handoffIdentity,
  historicalWorkflowMatchesRequest,
} from "@/lib/historical-workflow/historical-handoff-identity";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import {
  workflowSymbolRoutes,
  type WorkflowSymbolRoutes,
} from "@/lib/historical-workflow/workflow-symbol-routes";
import type { SecurityId } from "@/types/security-identity";

const SECURITY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SYMBOL_TILE_ROUTE: Partial<Record<string, keyof WorkflowSymbolRoutes>> = {
  "/dashboard/screeners": "screeners",
  "/dashboard/catalyst": "catalyst",
  "/dashboard/watchlist": "watchlist",
  "/dashboard/ai": "ai",
  "/dashboard/journal": "journal",
};

export type ActionCenterHandoffQuery = {
  symbol: string;
  eventLabel: string | null;
  securityId: SecurityId | null;
};

export function parseHandoffSecurityId(raw: string | null): SecurityId | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  return SECURITY_ID_RE.test(trimmed) ? (trimmed as SecurityId) : null;
}

/** Scanner / AM Inbox handoff query including validated `securityId` when present on the URL. */
export function readActionCenterHandoffQuery(params: URLSearchParams): ActionCenterHandoffQuery | null {
  const base = readScannerHandoffQuery(params);
  if (!base) return null;
  return {
    ...base,
    securityId: parseHandoffSecurityId(params.get("securityId")),
  };
}

/**
 * Route hint for workflowSymbolRoutes: honor URL `securityId` when valid;
 * use session storage only when identities align (batch 173 conventions).
 */
export function actionCenterWorkflowRouteHint(
  symbol: string,
  urlSecurityId: SecurityId | null,
): { symbol: string; securityId: SecurityId | null } | null {
  const identity = handoffIdentity(symbol, urlSecurityId);
  if (!identity) return null;

  const session = readHistoricalWorkflowContext(identity.symbol);

  if (urlSecurityId) {
    if (session && !historicalWorkflowMatchesRequest(identity, session)) {
      return { symbol: identity.symbol, securityId: urlSecurityId };
    }
    return { symbol: identity.symbol, securityId: urlSecurityId };
  }

  if (session && historicalWorkflowMatchesRequest(identity, session)) {
    return { symbol: identity.symbol, securityId: session.securityId ?? null };
  }

  return { symbol: identity.symbol, securityId: null };
}

export type ActionCenterWorkflowHandoffInput = Pick<ActionCenterHandoffQuery, "symbol" | "securityId">;

/** Preserve handoff symbol and security identity on Continue Workflow symbol tiles. */
export function actionCenterWorkflowTileHref(
  genericRoute: string,
  handoff: ActionCenterWorkflowHandoffInput | string | null | undefined,
): string {
  const symbol =
    typeof handoff === "string" ? handoff : handoff?.symbol;
  const urlSecurityId =
    typeof handoff === "string" ? null : (handoff?.securityId ?? null);

  if (!symbol?.trim()) return genericRoute;
  const key = SYMBOL_TILE_ROUTE[genericRoute];
  if (!key) return genericRoute;
  const hint = actionCenterWorkflowRouteHint(symbol, urlSecurityId);
  const routes = workflowSymbolRoutes(symbol, hint);
  if (!routes) return genericRoute;
  return routes[key];
}
