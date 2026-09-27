import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type { ModelEvaluationId, StrategyId, StrategyVersionId } from "@/lib/ai-trader/domain/ids";

export const AI_TRADER_STRATEGY_STATUSES = [
  "PROPOSED",
  "BACKTESTING",
  "REJECTED",
  "SHADOW",
  "PAPER",
  "APPROVED_CONTROLLED_LIVE",
  "RETIRED",
] as const;

export type AiTraderStrategyStatus = (typeof AI_TRADER_STRATEGY_STATUSES)[number];

const LIVE_MONEY_MODES: readonly AiTraderOperatingMode[] = ["CONTROLLED_LIVE", "LIVE"];
const AI_WRITABLE_STATUSES: readonly AiTraderStrategyStatus[] = ["PROPOSED"];

/** Future strategy registry row. AI cannot promote status into a live mode. */
export interface AiTraderStrategyVersion {
  strategyId: StrategyId;
  version: StrategyVersionId;
  status: AiTraderStrategyStatus;
  parentVersion: StrategyVersionId | null;
  configurationHash: string;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  backtestEvaluationId: ModelEvaluationId | null;
  shadowEvaluationId: ModelEvaluationId | null;
  paperEvaluationId: ModelEvaluationId | null;
  allowedModes: readonly AiTraderOperatingMode[];
}

/** Identity is immutable after insert. Trusted services may update lifecycle fields. AI may not. */
export const STRATEGY_VERSION_IDENTITY_FIELDS = [
  "strategyId",
  "version",
  "parentVersion",
  "configurationHash",
  "createdAt",
] as const;

export const STRATEGY_VERSION_LIFECYCLE_FIELDS = [
  "status",
  "approvedAt",
  "approvedBy",
  "backtestEvaluationId",
  "shadowEvaluationId",
  "paperEvaluationId",
  "allowedModes",
] as const;

export function strategyVersionIdentityChanged(
  current: AiTraderStrategyVersion,
  next: AiTraderStrategyVersion,
): boolean {
  return STRATEGY_VERSION_IDENTITY_FIELDS.some((field) => current[field] !== next[field]);
}

export function strategyStatusAllowsLiveMoney(status: AiTraderStrategyStatus): boolean {
  return status === "APPROVED_CONTROLLED_LIVE";
}

export function canAiWriteStrategyStatus(status: AiTraderStrategyStatus): boolean {
  return AI_WRITABLE_STATUSES.includes(status);
}

export function strategyMayRunInMode(
  version: Pick<AiTraderStrategyVersion, "status" | "allowedModes" | "approvedBy">,
  mode: AiTraderOperatingMode,
): boolean {
  if (!version.allowedModes.includes(mode)) return false;
  if (!LIVE_MONEY_MODES.includes(mode)) return true;
  return version.status === "APPROVED_CONTROLLED_LIVE" && version.approvedBy !== null;
}
