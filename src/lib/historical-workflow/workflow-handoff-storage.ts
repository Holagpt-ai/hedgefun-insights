import {
  persistRadarHistoricalContextForAnalyst,
  RADAR_HISTORICAL_SESSION_PREFIX,
} from "@/lib/ai-analyst/radar-historical-handoff";
import { buildHistoricalWorkflowContext } from "@/lib/historical-workflow/build-historical-workflow-context";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

export const WORKFLOW_HISTORICAL_SESSION_PREFIX = "stocksist-workflow-historical:";
export const WORKFLOW_HISTORICAL_BY_ID_PREFIX = "stocksist-workflow-historical-id:";

export {
  RADAR_HISTORICAL_SESSION_PREFIX,
  persistRadarHistoricalContextForAnalyst,
} from "@/lib/ai-analyst/radar-historical-handoff";

function symbolKey(symbol: string): string {
  return `${WORKFLOW_HISTORICAL_SESSION_PREFIX}${symbol.trim().toUpperCase()}`;
}

function securityIdKey(securityId: SecurityId): string {
  return `${WORKFLOW_HISTORICAL_BY_ID_PREFIX}${securityId}`;
}

export function readHistoricalWorkflowContext(symbol: string): HistoricalWorkflowContext | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(symbolKey(symbol));
    if (!raw) return null;
    return JSON.parse(raw) as HistoricalWorkflowContext;
  } catch {
    return null;
  }
}

export function readHistoricalWorkflowContextBySecurityId(
  securityId: SecurityId,
): HistoricalWorkflowContext | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(securityIdKey(securityId));
    if (!raw) return null;
    return JSON.parse(raw) as HistoricalWorkflowContext;
  } catch {
    return null;
  }
}

export function persistHistoricalWorkflowContext(context: HistoricalWorkflowContext): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload = JSON.stringify(context);
    sessionStorage.setItem(symbolKey(context.symbol), payload);
    if (context.securityId) {
      sessionStorage.setItem(securityIdKey(context.securityId), payload);
    }
  } catch {
    // quota / privacy mode
  }
}

export function readPreloadedRepeatMoverContext(symbol: string): RepeatMoverContext | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${RADAR_HISTORICAL_SESSION_PREFIX}${symbol.trim().toUpperCase()}`);
    if (!raw) return null;
    return JSON.parse(raw) as RepeatMoverContext;
  } catch {
    return null;
  }
}

export function persistHistoricalWorkflowHandoff(
  context: RepeatMoverContext | null | undefined,
  input: {
    symbol: string;
    sourceSurface: HistoricalWorkflowContext["sourceSurface"];
    securityId?: SecurityId | null;
    nowMs?: number;
  },
): HistoricalWorkflowContext {
  const workflow = buildHistoricalWorkflowContext({
    symbol: input.symbol,
    securityId: input.securityId ?? context?.securityId ?? null,
    sourceSurface: input.sourceSurface,
    repeatMoverContext: context,
    nowMs: input.nowMs,
  });
  persistHistoricalWorkflowContext(workflow);
  if (context) {
    persistRadarHistoricalContextForAnalyst(input.symbol, context);
  }
  return workflow;
}
