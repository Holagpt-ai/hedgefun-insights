import type { AiTraderWatchlistItem, AiTraderWatchlistTransition } from "@/lib/ai-trader/domain/watchlist";
import { assertSprint3AEngineState } from "@/lib/ai-trader/domain/watchlist";
import { buildWatchlistTransitionIdempotencyKey } from "@/lib/ai-trader/domain/watchlist-transition-rpc";
import { isUndefinedTableError, MemoryPersistenceError, type SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { applyWatchlistTransitionRpc } from "@/lib/ai-trader/persistence/watchlist-transition-rpc";
import { parseNullableNumeric } from "@/lib/ai-trader/persistence/row-mappers";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";
import { cooldownUntilFrom } from "@/lib/ai-trader/runtime/aging";
import { SHADOW_OBSERVATION_POLICY } from "@/lib/ai-trader/runtime/observation-policy";

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapItem(row: Record<string, unknown>): AiTraderWatchlistItem {
  return {
    id: String(row.id ?? ""),
    symbol: String(row.symbol ?? ""),
    securityId: row.security_id == null ? null : String(row.security_id),
    assetClass: "US_EQUITY",
    state: row.state as AiTraderWatchlistItem["state"],
    discoveredAt: String(row.discovered_at ?? ""),
    lastEvaluatedAt: String(row.last_evaluated_at ?? ""),
    currentPriority: parseNullableNumeric(row.current_priority) ?? 0,
    source: String(row.source ?? ""),
    sourceRank: parseNullableNumeric(row.source_rank) ?? 0,
    sourceSession: row.source_session == null ? null : String(row.source_session),
    contextSnapshotId: row.context_snapshot_id == null ? null : String(row.context_snapshot_id),
    catalystRefs: jsonArray(row.catalyst_refs),
    marketEvidenceRefs: jsonArray(row.market_evidence_refs),
    reasonCodes: jsonArray(row.reason_codes).map(String),
    confidence: parseNullableNumeric(row.confidence),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    cooldownUntil: row.cooldown_until == null ? null : String(row.cooldown_until),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function run<T extends Record<string, unknown>>(
  executor: SqlExecutor,
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  try {
    return await executor.query<T>(text, params);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new MemoryPersistenceError(
        "TABLES_NOT_APPLIED",
        "AI Trader watchlist tables are not applied. The OFF shell does not need them.",
      );
    }
    throw error;
  }
}

export async function listWatchlistItems(executor: SqlExecutor): Promise<readonly AiTraderWatchlistItem[]> {
  const rows = await run(executor, `SELECT * FROM public.ai_trader_watchlist_items ORDER BY source_rank ASC, symbol ASC`);
  return rows.map(mapItem);
}

export async function persistWatchlistProposal(
  executor: SqlExecutor,
  proposal: WatchlistProposal,
  occurredAt: string,
  cycle?: { cycleId: string; policyVersion?: string; sourceObservationIdentity?: string | null },
): Promise<{ item: AiTraderWatchlistItem; transition: Pick<AiTraderWatchlistTransition, "newState"> }> {
  const nextState = assertSprint3AEngineState(proposal.nextState);
  const result = await applyWatchlistTransitionRpc(executor, {
    symbol: proposal.symbol,
    newState: nextState,
    expectedPriorState: proposal.priorState,
    idempotencyKey: buildWatchlistTransitionIdempotencyKey({
      symbol: proposal.symbol,
      priorState: proposal.priorState,
      newState: nextState,
      cycleId: cycle?.cycleId ?? "unspecified-cycle",
      policyVersion: cycle?.policyVersion ?? SHADOW_OBSERVATION_POLICY.version,
      sourceObservationIdentity: cycle?.sourceObservationIdentity ?? null,
    }),
    occurredAt,
    sourceRank: proposal.sourceRank,
    source: proposal.source,
    sourceSession: proposal.sourceSession,
    reasonCodes: proposal.reasonCodes,
    evidenceIds: [],
    contextSnapshotId: null,
    actorType: "SYSTEM",
    catalystRefs: proposal.catalystRefs,
    marketEvidenceRefs: proposal.marketEvidenceRefs,
    cooldownUntil: nextState === "COOLDOWN" ? cooldownUntilFrom(Date.parse(occurredAt)) : null,
  });
  if (result.status === "CONFLICT") {
    throw new MemoryPersistenceError("WATCHLIST_CONFLICT", result.message ?? "watchlist transition conflict");
  }
  if (result.status === "PROHIBITED_STATE") {
    throw new MemoryPersistenceError("PROHIBITED_STATE", result.message ?? "prohibited watchlist state");
  }
  if (result.status === "INVALID_TRANSITION") {
    throw new MemoryPersistenceError("INVALID_TRANSITION", result.message ?? "invalid watchlist transition");
  }
  if (result.status === "FAILED") {
    throw new MemoryPersistenceError("RPC_NOT_APPLIED", result.message ?? "watchlist transition RPC failed");
  }
  const rows = await run(
    executor,
    `SELECT * FROM public.ai_trader_watchlist_items WHERE symbol = $1 LIMIT 1`,
    [proposal.symbol],
  );
  return { item: mapItem(rows[0] ?? {}), transition: { newState: nextState } };
}
