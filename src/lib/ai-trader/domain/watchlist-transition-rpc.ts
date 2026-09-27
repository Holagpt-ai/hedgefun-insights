import {
  AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES,
  AI_TRADER_WATCHLIST_SPRINT_3A_STATES,
  AI_TRADER_WATCHLIST_TRANSITIONS,
  type AiTraderWatchlistItem,
  type AiTraderWatchlistState,
} from "@/lib/ai-trader/domain/watchlist";

export const WATCHLIST_TRANSITION_RPC_NAME = "ai_trader_apply_watchlist_transition_v1" as const;

export const WATCHLIST_TRANSITION_RPC_STATUSES = [
  "APPLIED",
  "NO_CHANGE",
  "CONFLICT",
  "INVALID_TRANSITION",
  "PROHIBITED_STATE",
  "FAILED",
] as const;

export type WatchlistTransitionRpcStatus = (typeof WATCHLIST_TRANSITION_RPC_STATUSES)[number];

export interface WatchlistTransitionRpcInput {
  symbol: string;
  newState: AiTraderWatchlistState;
  expectedPriorState: AiTraderWatchlistState | null;
  expectedUpdatedAt?: string | null;
  idempotencyKey: string;
  occurredAt: string;
  sourceRank: number;
  source: string;
  sourceSession: string | null;
  reasonCodes: readonly string[];
  evidenceIds: readonly string[];
  contextSnapshotId: string | null;
  sessionId?: string | null;
  actorType: string;
  catalystRefs: readonly unknown[];
  marketEvidenceRefs: readonly unknown[];
  cooldownUntil: string | null;
  expiresAt?: string | null;
  confidence?: number | null;
}

export interface WatchlistTransitionRpcResult {
  status: WatchlistTransitionRpcStatus;
  itemId: string | null;
  transitionId: string | null;
  symbol: string;
  priorState: AiTraderWatchlistState | null;
  newState: AiTraderWatchlistState | null;
  idempotencyKey: string;
  message?: string;
}

export function buildWatchlistTransitionIdempotencyKey(input: {
  symbol: string;
  priorState: string | null;
  newState: string;
  cycleId: string;
  policyVersion: string;
  contextSnapshotId?: string | null;
  sourceObservationIdentity?: string | null;
}): string {
  return [
    "wl-tx",
    input.symbol,
    input.priorState ?? "NULL",
    input.newState,
    input.cycleId,
    input.policyVersion,
    input.contextSnapshotId ?? "NO_CONTEXT",
    input.sourceObservationIdentity ?? "NO_SOURCE_OBS",
  ].join(":");
}

export function toWatchlistTransitionRpcPayload(input: WatchlistTransitionRpcInput): Record<string, unknown> {
  return {
    symbol: input.symbol,
    new_state: input.newState,
    expected_prior_state: input.expectedPriorState,
    expected_updated_at: input.expectedUpdatedAt ?? null,
    idempotency_key: input.idempotencyKey,
    occurred_at: input.occurredAt,
    source_rank: input.sourceRank,
    source: input.source,
    source_session: input.sourceSession,
    reason_codes: input.reasonCodes,
    evidence_ids: input.evidenceIds,
    context_snapshot_id: input.contextSnapshotId,
    session_id: input.sessionId ?? null,
    actor_type: input.actorType,
    catalyst_refs: input.catalystRefs,
    market_evidence_refs: input.marketEvidenceRefs,
    cooldown_until: input.cooldownUntil,
    expires_at: input.expiresAt ?? null,
    confidence: input.confidence ?? null,
  };
}

export function parseWatchlistTransitionRpcResult(value: unknown): WatchlistTransitionRpcResult {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const status = String(row.status ?? "FAILED");
  if (!(WATCHLIST_TRANSITION_RPC_STATUSES as readonly string[]).includes(status)) {
    return {
      status: "FAILED",
      itemId: null,
      transitionId: null,
      symbol: String(row.symbol ?? ""),
      priorState: null,
      newState: null,
      idempotencyKey: String(row.idempotency_key ?? ""),
      message: "unrecognized RPC status",
    };
  }
  return {
    status: status as WatchlistTransitionRpcStatus,
    itemId: row.item_id == null ? null : String(row.item_id),
    transitionId: row.transition_id == null ? null : String(row.transition_id),
    symbol: String(row.symbol ?? ""),
    priorState: row.prior_state == null ? null : (String(row.prior_state) as AiTraderWatchlistState),
    newState: row.new_state == null ? null : (String(row.new_state) as AiTraderWatchlistState),
    idempotencyKey: String(row.idempotency_key ?? ""),
    message: row.message == null ? undefined : String(row.message),
  };
}

function isShadowEraState(state: string): boolean {
  return (AI_TRADER_WATCHLIST_SPRINT_3A_STATES as readonly string[]).includes(state);
}

function isProhibited(state: string): boolean {
  return (AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES as readonly string[]).includes(state);
}

export interface InMemoryWatchlistTransitionStore {
  items: AiTraderWatchlistItem[];
  transitions: Array<{
    id: string;
    watchlistItemId: string;
    symbol: string;
    priorState: AiTraderWatchlistState | null;
    newState: AiTraderWatchlistState;
    idempotencyKey: string;
  }>;
}

/**
 * In-memory mirror of ai_trader_apply_watchlist_transition_v1 for unit tests.
 * No network. Does not apply the production migration.
 */
export function simulateWatchlistTransitionRpc(
  store: InMemoryWatchlistTransitionStore,
  input: WatchlistTransitionRpcInput,
): WatchlistTransitionRpcResult {
  const failed = (status: WatchlistTransitionRpcStatus, message: string, itemId: string | null = null): WatchlistTransitionRpcResult => ({
    status,
    itemId,
    transitionId: null,
    symbol: input.symbol,
    priorState: input.expectedPriorState,
    newState: input.newState,
    idempotencyKey: input.idempotencyKey,
    message,
  });

  if (!input.symbol || !input.newState || !input.idempotencyKey) {
    return failed("FAILED", "symbol, new_state, and idempotency_key are required");
  }
  if (isProhibited(input.newState) || !isShadowEraState(input.newState)) {
    return failed("PROHIBITED_STATE", "SHADOW-era RPC cannot enter ENTRY_READY, POSITION_OPEN, or EXITED");
  }
  if (!Number.isInteger(input.sourceRank) || input.sourceRank < 1) {
    return failed("FAILED", "source_rank must be >= 1");
  }

  const existingTx = store.transitions.find((row) => row.idempotencyKey === input.idempotencyKey);
  if (existingTx) {
    return {
      status: "NO_CHANGE",
      itemId: existingTx.watchlistItemId,
      transitionId: existingTx.id,
      symbol: existingTx.symbol,
      priorState: existingTx.priorState,
      newState: existingTx.newState,
      idempotencyKey: existingTx.idempotencyKey,
      message: "idempotent retry",
    };
  }

  let item = store.items.find((row) => row.symbol === input.symbol);
  if (!item) {
    if (input.expectedPriorState != null) {
      return failed("CONFLICT", "expected an existing item");
    }
    if (input.newState !== "DISCOVERED") {
      return failed("INVALID_TRANSITION", "first row must be DISCOVERED");
    }
    const created: AiTraderWatchlistItem = {
      id: `wl-${input.symbol}`,
      symbol: input.symbol,
      securityId: null,
      assetClass: "US_EQUITY",
      state: "DISCOVERED",
      discoveredAt: input.occurredAt,
      lastEvaluatedAt: input.occurredAt,
      currentPriority: input.sourceRank,
      source: input.source,
      sourceRank: input.sourceRank,
      sourceSession: input.sourceSession,
      contextSnapshotId: input.contextSnapshotId,
      catalystRefs: input.catalystRefs,
      marketEvidenceRefs: input.marketEvidenceRefs,
      reasonCodes: input.reasonCodes,
      confidence: input.confidence ?? null,
      expiresAt: input.expiresAt ?? null,
      cooldownUntil: null,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    };
    store.items.push(created);
    const transition = {
      id: `tx-${input.idempotencyKey}`,
      watchlistItemId: created.id,
      symbol: input.symbol,
      priorState: null,
      newState: "DISCOVERED" as const,
      idempotencyKey: input.idempotencyKey,
    };
    store.transitions.push(transition);
    return {
      status: "APPLIED",
      itemId: created.id,
      transitionId: transition.id,
      symbol: input.symbol,
      priorState: null,
      newState: "DISCOVERED",
      idempotencyKey: input.idempotencyKey,
    };
  }

  if (isProhibited(item.state)) {
    return failed("PROHIBITED_STATE", "SHADOW-era RPC cannot mutate trading-state items", item.id);
  }
  if (input.expectedPriorState !== item.state) {
    return {
      status: "CONFLICT",
      itemId: item.id,
      transitionId: null,
      symbol: input.symbol,
      priorState: item.state,
      newState: input.newState,
      idempotencyKey: input.idempotencyKey,
      message: "expected_prior_state does not match locked current state",
    };
  }
  if (input.expectedUpdatedAt && item.updatedAt !== input.expectedUpdatedAt) {
    return failed("CONFLICT", "expected_updated_at does not match locked current row", item.id);
  }
  if (item.state === input.newState) {
    return {
      status: "NO_CHANGE",
      itemId: item.id,
      transitionId: null,
      symbol: input.symbol,
      priorState: item.state,
      newState: input.newState,
      idempotencyKey: input.idempotencyKey,
      message: "current state already equals new_state",
    };
  }
  if (!AI_TRADER_WATCHLIST_TRANSITIONS[item.state].includes(input.newState)) {
    return failed("INVALID_TRANSITION", `illegal watchlist transition ${item.state} → ${input.newState}`, item.id);
  }

  const transition = {
    id: `tx-${input.idempotencyKey}`,
    watchlistItemId: item.id,
    symbol: input.symbol,
    priorState: item.state,
    newState: input.newState,
    idempotencyKey: input.idempotencyKey,
  };
  store.transitions.push(transition);
  item.state = input.newState;
  item.lastEvaluatedAt = input.occurredAt;
  item.currentPriority = input.sourceRank;
  item.source = input.source;
  item.sourceRank = input.sourceRank;
  item.sourceSession = input.sourceSession;
  item.reasonCodes = input.reasonCodes;
  item.catalystRefs = input.catalystRefs;
  item.marketEvidenceRefs = input.marketEvidenceRefs;
  item.cooldownUntil = input.newState === "COOLDOWN" ? input.cooldownUntil : null;
  item.updatedAt = input.occurredAt;
  return {
    status: "APPLIED",
    itemId: item.id,
    transitionId: transition.id,
    symbol: input.symbol,
    priorState: transition.priorState,
    newState: input.newState,
    idempotencyKey: input.idempotencyKey,
  };
}
