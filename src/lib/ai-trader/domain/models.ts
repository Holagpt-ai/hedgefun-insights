import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type { ModelAssignmentId, ModelEvaluationId } from "@/lib/ai-trader/domain/ids";

export type AiTraderModelRole =
  | "RESEARCH_MODEL"
  | "TRADE_PLANNER_MODEL"
  | "DECISION_MODEL"
  | "CRITIC_MODEL"
  | "EXPLANATION_MODEL"
  | "POST_TRADE_MODEL"
  | "REFLECTION_MODEL"
  | "STRATEGY_RESEARCH_MODEL";

export const AI_TRADER_MODEL_ROLES: readonly AiTraderModelRole[] = [
  "RESEARCH_MODEL",
  "TRADE_PLANNER_MODEL",
  "DECISION_MODEL",
  "CRITIC_MODEL",
  "EXPLANATION_MODEL",
  "POST_TRADE_MODEL",
  "REFLECTION_MODEL",
  "STRATEGY_RESEARCH_MODEL",
];

/** Future registry row. No model is assigned. */
export interface AiTraderModelAssignment {
  assignmentId: ModelAssignmentId;
  role: AiTraderModelRole;
  provider: string;
  model: string;
  modelVersion: string;
  promptVersion: string;
  schemaVersion: string;
  approvedModes: readonly AiTraderOperatingMode[];
  evaluationId: ModelEvaluationId;
  activeFrom: string;
  activeUntil: string | null;
  approvedBy: string;
}

export interface AiTraderModelEvaluation {
  evaluationId: ModelEvaluationId;
  role: AiTraderModelRole;
  provider: string;
  model: string;
  modelVersion: string;
  suiteId: string;
  datasetVersion: string;
  results: Record<string, unknown>;
  approvedForModes: readonly AiTraderOperatingMode[];
  approvedAt: string | null;
  approvedBy: string | null;
}

const LIVE_MONEY_MODES: readonly AiTraderOperatingMode[] = ["CONTROLLED_LIVE", "LIVE"];

/** Assignment identity/configuration is immutable. Only activeUntil may close once. */
export const MODEL_ASSIGNMENT_MUTABLE_FIELDS = ["activeUntil"] as const;

export function canCloseModelAssignmentActiveUntil(
  currentActiveUntil: string | null,
  nextActiveUntil: string | null,
): boolean {
  if (nextActiveUntil === currentActiveUntil) return true;
  return currentActiveUntil === null && nextActiveUntil !== null;
}

export function assignmentCoversRoleAt(
  assignment: AiTraderModelAssignment,
  role: AiTraderModelRole,
  asOf: string,
  mode: AiTraderOperatingMode,
): boolean {
  if (assignment.role !== role) return false;
  if (!assignment.approvedModes.includes(mode)) return false;
  if (assignment.activeFrom > asOf) return false;
  if (assignment.activeUntil !== null && assignment.activeUntil <= asOf) return false;
  return true;
}

export function evaluationAllowsMode(evaluation: AiTraderModelEvaluation, mode: AiTraderOperatingMode): boolean {
  if (!evaluation.approvedForModes.includes(mode)) return false;
  if (LIVE_MONEY_MODES.includes(mode) && evaluation.approvedBy === null) return false;
  return true;
}

/** Sprint 2A has no selected vendor or model. */
export const AI_TRADER_SELECTED_MODEL_ASSIGNMENT: AiTraderModelAssignment | null = null;
