import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

export interface HandoffIdentity {
  symbol: string;
  securityId: SecurityId | null;
}

export function handoffIdentity(
  symbol: string,
  securityId?: SecurityId | null,
): HandoffIdentity | null {
  const normalized = normalizeHandoffSymbol(symbol);
  if (!normalized) return null;
  return { symbol: normalized, securityId: securityId ?? null };
}

/**
 * True when compact workflow cache may enrich a navigation or persistence request.
 * Rejects cross-security contamination when both sides carry security IDs.
 */
export function historicalWorkflowMatchesRequest(
  request: HandoffIdentity,
  workflow: Pick<HistoricalWorkflowContext, "symbol" | "securityId"> | null | undefined,
): boolean {
  if (!workflow) return false;
  const workflowSymbol = normalizeHandoffSymbol(workflow.symbol);
  if (!workflowSymbol || workflowSymbol !== request.symbol) return false;

  const requestId = request.securityId;
  const workflowId = workflow.securityId;
  if (requestId && workflowId && requestId !== workflowId) return false;
  if (requestId && !workflowId) return false;

  return true;
}

/** RepeatMoverContext must match the symbol (and optional securityId) used for session storage keys. */
export function repeatMoverContextMatchesHandoff(
  request: HandoffIdentity,
  context: Pick<RepeatMoverContext, "securityId" | "currentSymbol"> | null | undefined,
): boolean {
  if (!context?.securityId) return false;

  const contextSymbol = normalizeHandoffSymbol(context.currentSymbol ?? "");
  if (contextSymbol && contextSymbol !== request.symbol) return false;

  if (request.securityId && context.securityId !== request.securityId) return false;

  return true;
}
