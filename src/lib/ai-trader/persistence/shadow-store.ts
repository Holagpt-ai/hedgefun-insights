import type { AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import { assertSprint3AEngineState } from "@/lib/ai-trader/domain/watchlist";
import { buildWatchlistTransitionIdempotencyKey } from "@/lib/ai-trader/domain/watchlist-transition-rpc";
import { isUndefinedTableError, MemoryPersistenceError, type SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { applyWatchlistTransitionRpc } from "@/lib/ai-trader/persistence/watchlist-transition-rpc";
import { listWatchlistItems } from "@/lib/ai-trader/persistence/watchlist-store";
import { upsertContextSnapshot } from "@/lib/ai-trader/persistence/postgres-memory-provider";
import { cooldownUntilFrom } from "@/lib/ai-trader/runtime/aging";
import type { ShadowPersistence, ShadowWatchlistChangeRequest } from "@/lib/ai-trader/runtime/shadow-persistence";

async function run<T extends Record<string, unknown>>(
  executor: SqlExecutor,
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  try {
    return await executor.query<T>(text, params);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new MemoryPersistenceError("TABLES_NOT_APPLIED", "AI Trader shadow tables are not applied.");
    }
    throw error;
  }
}

/**
 * Authoritative path: one Postgres RPC per watchlist change.
 * Non-atomic insert/update pairs are no longer used.
 */
export function createSqlShadowPersistence(executor: SqlExecutor): ShadowPersistence {
  return {
    listWatchlistItems: () => listWatchlistItems(executor),
    async persistWatchlistChange(proposal: ShadowWatchlistChangeRequest, occurredAt: string) {
      const nextState = assertSprint3AEngineState(proposal.nextState);
      const result = await applyWatchlistTransitionRpc(executor, {
        symbol: proposal.symbol,
        newState: nextState,
        expectedPriorState: proposal.priorState,
        idempotencyKey: buildWatchlistTransitionIdempotencyKey({
          symbol: proposal.symbol,
          priorState: proposal.priorState,
          newState: nextState,
          cycleId: proposal.cycleId,
          policyVersion: proposal.policyVersion,
          contextSnapshotId: proposal.contextSnapshotId,
          sourceObservationIdentity: proposal.sourceObservationIdentity,
        }),
        occurredAt,
        sourceRank: proposal.sourceRank,
        source: proposal.source,
        sourceSession: proposal.sourceSession,
        reasonCodes: proposal.reasonCodes,
        evidenceIds: [],
        contextSnapshotId: proposal.contextSnapshotId ?? null,
        actorType: "SYSTEM",
        catalystRefs: proposal.catalystRefs,
        marketEvidenceRefs: proposal.marketEvidenceRefs,
        cooldownUntil: nextState === "COOLDOWN" ? cooldownUntilFrom(Date.parse(occurredAt)) : null,
      });
      if (result.status === "NO_CHANGE") return result.transitionId ? "duplicate" : "unchanged";
      if (result.status === "CONFLICT") return "conflict";
      if (result.status === "PROHIBITED_STATE") {
        throw new MemoryPersistenceError("PROHIBITED_STATE", result.message ?? "prohibited watchlist state");
      }
      if (result.status === "INVALID_TRANSITION") {
        throw new MemoryPersistenceError("INVALID_TRANSITION", result.message ?? "invalid watchlist transition");
      }
      if (result.status !== "APPLIED") {
        throw new MemoryPersistenceError("RPC_NOT_APPLIED", result.message ?? result.status);
      }
      return proposal.priorState == null ? "inserted" : "updated";
    },
    async upsertContextSnapshot(input) {
      const result = await upsertContextSnapshot(executor, input);
      return result.id ? "reused" : "inserted";
    },
    async recordObservation(observation: AiTraderObservation, sourceEventKey: string) {
      const rows = await run(
        executor,
        `INSERT INTO public.ai_trader_observations (
          symbol, asset_class, observed_at, observation_type, value_json, source,
          source_type, source_id, source_timestamp, retrieved_at, verification_state, quality_score, source_event_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (source_event_key) WHERE source_event_key IS NOT NULL DO NOTHING
        RETURNING id`,
        [
          observation.instrument.symbol,
          observation.instrument.assetClass,
          observation.observedAt,
          observation.observationType,
          observation.value,
          observation.provenance.source,
          observation.provenance.sourceType,
          observation.provenance.sourceId,
          observation.provenance.sourceTimestamp,
          observation.provenance.retrievedAt,
          observation.provenance.verificationState,
          observation.qualityScore,
          sourceEventKey,
        ],
      );
      return rows[0]?.id ? "inserted" : "duplicate";
    },
  };
}
