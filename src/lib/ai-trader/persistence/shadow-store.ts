import type { AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { AiTraderWatchlistItem } from "@/lib/ai-trader/domain/watchlist";
import { assertSprint3AEngineState, canTransitionWatchlistState } from "@/lib/ai-trader/domain/watchlist";
import { isUndefinedTableError, MemoryPersistenceError, type SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { listWatchlistItems } from "@/lib/ai-trader/persistence/watchlist-store";
import { upsertContextSnapshot } from "@/lib/ai-trader/persistence/postgres-memory-provider";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";
import type { ShadowPersistence } from "@/lib/ai-trader/runtime/shadow-persistence";
import { parseNullableNumeric } from "@/lib/ai-trader/persistence/row-mappers";

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
    catalystRefs: Array.isArray(row.catalyst_refs) ? row.catalyst_refs : [],
    marketEvidenceRefs: Array.isArray(row.market_evidence_refs) ? row.market_evidence_refs : [],
    reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes.map(String) : [],
    confidence: parseNullableNumeric(row.confidence),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    cooldownUntil: row.cooldown_until == null ? null : String(row.cooldown_until),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/**
 * Write order: existing items append transition first, then update current state.
 * New items insert the row (FK), then the transition.
 * Not a Postgres transaction. See the Sprint 3C RPC proposal.
 */
export function createSqlShadowPersistence(executor: SqlExecutor): ShadowPersistence {
  return {
    listWatchlistItems: () => listWatchlistItems(executor),
    async persistWatchlistChange(proposal: WatchlistProposal, occurredAt: string) {
      const nextState = assertSprint3AEngineState(proposal.nextState);
      const existingRows = await run(
        executor,
        `SELECT * FROM public.ai_trader_watchlist_items WHERE symbol = $1 LIMIT 1`,
        [proposal.symbol],
      );
      const existing = existingRows[0] ? mapItem(existingRows[0]) : null;
      if (existing?.state === nextState) return "unchanged";
      if (existing && !canTransitionWatchlistState(existing.state, nextState)) {
        throw new MemoryPersistenceError("NOT_SUPPORTED_YET", `Illegal watchlist transition ${existing.state} → ${nextState}`);
      }

      if (!existing) {
        const inserted = await run(
          executor,
          `INSERT INTO public.ai_trader_watchlist_items (
            symbol, state, discovered_at, last_evaluated_at, current_priority, source, source_rank,
            source_session, catalyst_refs, market_evidence_refs, reason_codes
          ) VALUES ($1,$2,$3,$3,$4,$5,$4,$6,$7,$8,$9)
          RETURNING *`,
          [
            proposal.symbol,
            nextState,
            occurredAt,
            proposal.sourceRank,
            proposal.source,
            proposal.sourceSession,
            proposal.catalystRefs,
            proposal.marketEvidenceRefs,
            proposal.reasonCodes,
          ],
        );
        await run(
          executor,
          `INSERT INTO public.ai_trader_watchlist_transitions (
            watchlist_item_id, symbol, prior_state, new_state, occurred_at, reason_codes,
            evidence_ids, source_rank, actor_type, source
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            inserted[0]?.id,
            proposal.symbol,
            null,
            nextState,
            occurredAt,
            proposal.reasonCodes,
            [],
            proposal.sourceRank,
            "SYSTEM",
            proposal.source,
          ],
        );
        return "inserted";
      }

      const duplicate = await run(
        executor,
        `SELECT id FROM public.ai_trader_watchlist_transitions
         WHERE watchlist_item_id = $1 AND prior_state IS NOT DISTINCT FROM $2
           AND new_state = $3 AND occurred_at = $4
         LIMIT 1`,
        [existing.id, proposal.priorState, nextState, occurredAt],
      );
      if (duplicate[0]) return "duplicate";

      await run(
        executor,
        `INSERT INTO public.ai_trader_watchlist_transitions (
          watchlist_item_id, symbol, prior_state, new_state, occurred_at, reason_codes,
          evidence_ids, source_rank, actor_type, source
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          existing.id,
          proposal.symbol,
          proposal.priorState,
          nextState,
          occurredAt,
          proposal.reasonCodes,
          [],
          proposal.sourceRank,
          "SYSTEM",
          proposal.source,
        ],
      );
      await run(
        executor,
        `UPDATE public.ai_trader_watchlist_items
         SET state = $2, last_evaluated_at = $3, current_priority = $4, source = $5, source_rank = $4,
             source_session = $6, catalyst_refs = $7, market_evidence_refs = $8, reason_codes = $9, updated_at = $3
         WHERE id = $1`,
        [
          existing.id,
          nextState,
          occurredAt,
          proposal.sourceRank,
          proposal.source,
          proposal.sourceSession,
          proposal.catalystRefs,
          proposal.marketEvidenceRefs,
          proposal.reasonCodes,
        ],
      );
      return "updated";
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
