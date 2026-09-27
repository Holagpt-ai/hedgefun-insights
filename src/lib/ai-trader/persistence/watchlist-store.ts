import type { AiTraderWatchlistItem, AiTraderWatchlistTransition } from "@/lib/ai-trader/domain/watchlist";
import { assertSprint3AEngineState, canTransitionWatchlistState } from "@/lib/ai-trader/domain/watchlist";
import { isUndefinedTableError, MemoryPersistenceError, type SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { parseNullableNumeric } from "@/lib/ai-trader/persistence/row-mappers";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";

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
): Promise<{ item: AiTraderWatchlistItem; transition: Pick<AiTraderWatchlistTransition, "newState"> }> {
  const nextState = assertSprint3AEngineState(proposal.nextState);
  const existingRows = await run(
    executor,
    `SELECT * FROM public.ai_trader_watchlist_items WHERE symbol = $1 LIMIT 1`,
    [proposal.symbol],
  );
  const existing = existingRows[0] ? mapItem(existingRows[0]) : null;
  if (existing && !canTransitionWatchlistState(existing.state, nextState) && existing.state !== nextState) {
    throw new MemoryPersistenceError("NOT_SUPPORTED_YET", `Illegal watchlist transition ${existing.state} → ${nextState}`);
  }

  let itemRows: Record<string, unknown>[];
  if (!existing) {
    itemRows = await run(
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
  } else {
    itemRows = await run(
      executor,
      `UPDATE public.ai_trader_watchlist_items
       SET state = $2, last_evaluated_at = $3, current_priority = $4, source = $5, source_rank = $4,
           source_session = $6, catalyst_refs = $7, market_evidence_refs = $8, reason_codes = $9, updated_at = $3
       WHERE id = $1
       RETURNING *`,
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
  }

  await run(
    executor,
    `INSERT INTO public.ai_trader_watchlist_transitions (
      watchlist_item_id, symbol, prior_state, new_state, occurred_at, reason_codes,
      evidence_ids, source_rank, actor_type, source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      itemRows[0]?.id,
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

  return { item: mapItem(itemRows[0] ?? {}), transition: { newState: nextState } };
}
