/** Branded-style aliases. Values are opaque strings; no ID is minted as market evidence. */
export type AiTraderAccountId = string;
export type AiTraderSessionId = string;
export type ContextSnapshotId = string;
export type ObservationId = string;
export type EpisodeId = string;
export type DecisionId = string;
export type TradePlanId = string;
export type CriticReviewId = string;
export type RiskDecisionId = string;
export type OrderIntentId = string;
export type TradeId = string;
export type PositionId = string;
export type ReflectionId = string;
export type StrategyId = string;
export type StrategyVersionId = string;
export type ModelAssignmentId = string;
export type ModelEvaluationId = string;
export type RiskConfigurationId = string;
export type RewardAssessmentId = string;
export type CounterfactualId = string;
export type StrategyCandidateId = string;
export type WatchlistItemId = string;
export type WatchlistTransitionId = string;

export const AI_TRADER_ID_PREFIXES = {
  account: "acct",
  session: "sess",
  context: "ctx",
  observation: "obs",
  episode: "ep",
  decision: "dec",
  tradePlan: "plan",
  critic: "crit",
  risk: "risk",
  orderIntent: "oint",
  trade: "trd",
  position: "pos",
  reflection: "refl",
  strategy: "strat",
  strategyVersion: "sver",
  modelAssignment: "masg",
  evaluation: "eval",
  riskConfig: "rcfg",
  reward: "rwd",
  counterfactual: "cf",
  candidate: "cand",
  watchlistItem: "wlitem",
  watchlistTransition: "wltr",
} as const;

/** Stable FNV-1a of a canonically serialized value. Not a cryptographic hash. */
export function stableJsonHash(value: unknown): string {
  const text = canonicalize(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}
