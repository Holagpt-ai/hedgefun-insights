import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";

/** New-entry proposals. These do not authorize an order. */
export type EntryDecisionAction = "ENTER" | "WAIT" | "PASS";

/**
 * Open-position proposals. These do not authorize an order.
 * They cannot increase risk: there is no add, scale-in, or widen-stop action.
 * Any later execution still requires the Risk Governor, the approved plan,
 * the Protective Order Manager, the Order Capability Registry, reconciliation,
 * and the kill switch.
 */
export const POSITION_DECISION_ACTIONS = [
  "HOLD",
  "REDUCE",
  "EXIT",
  "TAKE_PARTIAL",
  "TIGHTEN_STOP",
  "ACTIVATE_TRAIL",
] as const;

export type PositionDecisionAction = (typeof POSITION_DECISION_ACTIONS)[number];

export type AiTraderModelRole =
  | "RESEARCH_MODEL"
  | "TRADE_PLANNER_MODEL"
  | "DECISION_MODEL"
  | "CRITIC_MODEL"
  | "EXPLANATION_MODEL"
  | "POST_TRADE_MODEL"
  | "REFLECTION_MODEL"
  | "STRATEGY_RESEARCH_MODEL";

/** Future registry row. No model is assigned in Sprint 1. */
export interface AiTraderModelAssignment {
  role: AiTraderModelRole;
  provider: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  schemaVersion: string;
  approvedModes: readonly AiTraderOperatingMode[];
  evaluationId: string;
  activeFrom: string;
  activeUntil: string | null;
  approvedBy: string;
}

/** Future strategy registry row. AI cannot promote status into a live mode. */
export interface AiTraderStrategyVersion {
  strategyId: string;
  version: string;
  status: string;
  parentVersion: string | null;
  configurationHash: string;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  backtestEvaluationId: string | null;
  shadowEvaluationId: string | null;
  paperEvaluationId: string | null;
  allowedModes: readonly AiTraderOperatingMode[];
}

/** System-owned trading book. Credentials never belong on this record. */
export interface AiTraderAccount {
  accountId: string;
}

/** Frozen trading-day context. Credentials never belong on this record. */
export interface AiTraderSession {
  sessionId: string;
  accountId: string;
  sessionDate: string;
  operatingMode: AiTraderOperatingMode;
  strategyVersion: string | null;
  modelAssignmentVersion: string | null;
  riskConfigurationId: string | null;
  startingEquity: number | null;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
}

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
