import type { ContextSnapshotId, WatchlistItemId, WatchlistTransitionId } from "@/lib/ai-trader/domain/ids";
import type { AiTraderAssetClass } from "@/lib/ai-trader/domain/instrument";

export const AI_TRADER_WATCHLIST_STATES = [
  "DISCOVERED",
  "RESEARCHING",
  "WATCHING",
  "HIGH_PRIORITY",
  "ENTRY_READY",
  "POSITION_OPEN",
  "EXITED",
  "COOLDOWN",
  "REMOVED",
] as const;

export type AiTraderWatchlistState = (typeof AI_TRADER_WATCHLIST_STATES)[number];

/** Sprint 3A candidate engine may emit only these states. */
export const AI_TRADER_WATCHLIST_SPRINT_3A_STATES = [
  "DISCOVERED",
  "RESEARCHING",
  "WATCHING",
  "HIGH_PRIORITY",
  "COOLDOWN",
  "REMOVED",
] as const;

export type AiTraderWatchlistSprint3AState = (typeof AI_TRADER_WATCHLIST_SPRINT_3A_STATES)[number];

export const AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES = [
  "ENTRY_READY",
  "POSITION_OPEN",
  "EXITED",
] as const;

export type AiTraderWatchlistForbiddenEngineState =
  (typeof AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES)[number];

/**
 * Future graph. Terminal REMOVED may rediscover. EXITED only goes to COOLDOWN.
 * Sprint 3A engine never produces ENTRY_READY / POSITION_OPEN / EXITED.
 */
export const AI_TRADER_WATCHLIST_TRANSITIONS: Readonly<
  Record<AiTraderWatchlistState, readonly AiTraderWatchlistState[]>
> = {
  DISCOVERED: ["RESEARCHING", "REMOVED", "COOLDOWN"],
  RESEARCHING: ["WATCHING", "REMOVED", "COOLDOWN", "DISCOVERED"],
  WATCHING: ["HIGH_PRIORITY", "REMOVED", "COOLDOWN", "RESEARCHING"],
  HIGH_PRIORITY: ["ENTRY_READY", "REMOVED", "COOLDOWN", "WATCHING"],
  ENTRY_READY: ["POSITION_OPEN", "REMOVED", "COOLDOWN", "HIGH_PRIORITY"],
  POSITION_OPEN: ["EXITED"],
  EXITED: ["COOLDOWN"],
  COOLDOWN: ["WATCHING", "REMOVED"],
  REMOVED: ["DISCOVERED"],
};

export interface AiTraderWatchlistItem {
  id: WatchlistItemId;
  symbol: string;
  securityId: string | null;
  assetClass: AiTraderAssetClass;
  state: AiTraderWatchlistState;
  discoveredAt: string;
  lastEvaluatedAt: string;
  currentPriority: number;
  source: string;
  sourceRank: number;
  sourceSession: string | null;
  contextSnapshotId: ContextSnapshotId | null;
  catalystRefs: readonly unknown[];
  marketEvidenceRefs: readonly unknown[];
  reasonCodes: readonly string[];
  confidence: number | null;
  expiresAt: string | null;
  cooldownUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiTraderWatchlistTransition {
  id: WatchlistTransitionId;
  watchlistItemId: WatchlistItemId;
  symbol: string;
  priorState: AiTraderWatchlistState | null;
  newState: AiTraderWatchlistState;
  occurredAt: string;
  reasonCodes: readonly string[];
  evidenceIds: readonly string[];
  contextSnapshotId: ContextSnapshotId | null;
  sessionId: string | null;
  sourceRank: number | null;
  confidence: number | null;
  actorType: string;
  source: string;
  createdAt: string;
}

export function isWatchlistState(value: string): value is AiTraderWatchlistState {
  return (AI_TRADER_WATCHLIST_STATES as readonly string[]).includes(value);
}

export function isSprint3AWatchlistState(value: string): value is AiTraderWatchlistSprint3AState {
  return (AI_TRADER_WATCHLIST_SPRINT_3A_STATES as readonly string[]).includes(value);
}

export function isForbiddenEngineWatchlistState(
  value: string,
): value is AiTraderWatchlistForbiddenEngineState {
  return (AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES as readonly string[]).includes(value);
}

export function canTransitionWatchlistState(
  from: AiTraderWatchlistState,
  to: AiTraderWatchlistState,
): boolean {
  if (from === to) return true;
  return AI_TRADER_WATCHLIST_TRANSITIONS[from].includes(to);
}

export function assertSprint3AEngineState(state: AiTraderWatchlistState): AiTraderWatchlistSprint3AState {
  if (isForbiddenEngineWatchlistState(state)) {
    throw new Error(`Sprint 3A watchlist engine cannot produce ${state}`);
  }
  if (!isSprint3AWatchlistState(state)) {
    throw new Error(`Sprint 3A watchlist engine cannot produce ${state}`);
  }
  return state;
}

export function watchlistPatchIsLegal(
  current: AiTraderWatchlistItem,
  nextState: AiTraderWatchlistState,
): boolean {
  return canTransitionWatchlistState(current.state, nextState);
}
