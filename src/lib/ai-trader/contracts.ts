export {
  type EntryDecisionAction,
  POSITION_DECISION_ACTIONS,
  type PositionDecisionAction,
} from "@/lib/ai-trader/domain/decisions";

export {
  type AiTraderModelRole,
  type AiTraderModelAssignment,
} from "@/lib/ai-trader/domain/models";

export { type AiTraderStrategyVersion } from "@/lib/ai-trader/domain/strategies";
export { type AiTraderAccount } from "@/lib/ai-trader/domain/accounts";
export { type AiTraderSession } from "@/lib/ai-trader/domain/sessions";

export const AI_TRADER_WORKSPACE_TABS = [
  "Live",
  "Watchlist",
  "Positions",
  "Activity",
  "Research",
  "Trade History",
  "Performance",
] as const;

export type AiTraderWorkspaceTab = (typeof AI_TRADER_WORKSPACE_TABS)[number];
