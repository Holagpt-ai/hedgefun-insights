/**
 * Reuses existing AM Inbox symbol-aware navigation — no new routes.
 */

import { amInboxNavigatePath, amInboxWorkflowRoutes } from "@/lib/am-inbox/am-inbox-workflow-handoff";
import type { AmInboxPennyBadgeMatchTarget } from "@/lib/am-inbox/penny-continuation-workflow-types";
import type { SecurityId } from "@/types/security-identity";

export function pennyContinuationWorkflowRoutes(
  target: Pick<AmInboxPennyBadgeMatchTarget, "symbol" | "securityId">,
) {
  return amInboxWorkflowRoutes(target.symbol, target.securityId ?? null);
}

export function pennyContinuationNavigatePath(
  surface: "ai" | "catalyst" | "journal" | "watchlist" | "screeners" | "action_center",
  target: Pick<AmInboxPennyBadgeMatchTarget, "symbol" | "securityId">,
): string | null {
  const verifiedId: SecurityId | null = target.securityId ?? null;
  return amInboxNavigatePath(surface, target.symbol, verifiedId);
}
