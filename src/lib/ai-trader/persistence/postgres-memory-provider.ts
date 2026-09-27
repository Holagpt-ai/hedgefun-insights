import type { EpisodeId, ObservationId } from "@/lib/ai-trader/domain/ids";
import type {
  AiTraderEpisode,
  AiTraderObservation,
  AiTraderRegimeProfile,
  AiTraderSetupProfile,
  AiTraderSymbolProfile,
} from "@/lib/ai-trader/domain/memory";
import type { MemoryProvider, MemoryWriteResult } from "@/lib/ai-trader/providers/memory-provider";
import { isUndefinedTableError, MemoryPersistenceError, type SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { mapEpisodeRow, mapObservationRow } from "@/lib/ai-trader/persistence/row-mappers";
import {
  buildProfileAsOfQuery,
  buildSimilarEpisodesQueryBounded,
} from "@/lib/ai-trader/persistence/retrieval-queries";

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
        "AI Trader memory tables are not applied. The OFF shell does not need them.",
      );
    }
    throw error;
  }
}

export function createPostgresMemoryProvider(executor: SqlExecutor): MemoryProvider {
  return {
    id: "postgres",
    async recordObservation(observation: AiTraderObservation): Promise<MemoryWriteResult> {
      const rows = await run(
        executor,
        `INSERT INTO public.ai_trader_observations (
          symbol, asset_class, observed_at, observation_type, value_json, source,
          source_type, source_id, source_timestamp, retrieved_at, verification_state, quality_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        ],
      );
      return { id: String(rows[0]?.id ?? "") };
    },
    async recordEpisode(episode: AiTraderEpisode): Promise<MemoryWriteResult> {
      const rows = await run(
        executor,
        `INSERT INTO public.ai_trader_episodes (
          symbol, asset_class, session_date, episode_type, setup_type, strategy_version_id,
          market_regime, started_at, ended_at, entry_price, exit_price, mfe, mae,
          realized_pnl, net_pnl, feature_snapshot, outcome, context_snapshot_id,
          external_market_episode_id, trade_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING id`,
        [
          episode.instrument.symbol,
          episode.instrument.assetClass,
          episode.sessionDate,
          episode.episodeType,
          episode.setupType,
          episode.strategyVersion,
          episode.marketRegime,
          episode.startedAt,
          episode.endedAt,
          episode.entryPrice,
          episode.exitPrice,
          episode.mfe,
          episode.mae,
          episode.realizedPnl,
          episode.netPnl,
          episode.featureSnapshot,
          episode.outcome,
          episode.contextSnapshotId,
          episode.marketEpisodeId,
          episode.tradeId,
        ],
      );
      return { id: String(rows[0]?.id ?? "") };
    },
    async getObservation(id: ObservationId): Promise<AiTraderObservation | null> {
      const rows = await run(executor, `SELECT * FROM public.ai_trader_observations WHERE id = $1 LIMIT 1`, [id]);
      return rows[0] ? mapObservationRow(rows[0]) : null;
    },
    async getEpisode(id: EpisodeId): Promise<AiTraderEpisode | null> {
      const rows = await run(executor, `SELECT * FROM public.ai_trader_episodes WHERE id = $1 LIMIT 1`, [id]);
      return rows[0] ? mapEpisodeRow(rows[0]) : null;
    },
    async listEpisodesBySymbol(symbol: string, asOf: string): Promise<readonly AiTraderEpisode[]> {
      const query = buildSimilarEpisodesQueryBounded({ symbol, setupType: null, regimeKey: null, asOf });
      const rows = await run(executor, query.text, query.params);
      return rows.map(mapEpisodeRow);
    },
    async getCurrentSymbolProfile(_symbol: string): Promise<AiTraderSymbolProfile | null> {
      throw new MemoryPersistenceError(
        "NOT_SUPPORTED_YET",
        "Use findSymbolProfileAsOf. is_current is not valid for historical retrieval.",
      );
    },
    async getCurrentSetupProfile(_setupKey: string): Promise<AiTraderSetupProfile | null> {
      throw new MemoryPersistenceError(
        "NOT_SUPPORTED_YET",
        "Use findSetupProfileAsOf. is_current is not valid for historical retrieval.",
      );
    },
    async getCurrentRegimeProfile(_regimeKey: string): Promise<AiTraderRegimeProfile | null> {
      throw new MemoryPersistenceError(
        "NOT_SUPPORTED_YET",
        "Use findRegimeProfileAsOf. is_current is not valid for historical retrieval.",
      );
    },
  };
}

export async function findSymbolProfileAsOf(
  executor: SqlExecutor,
  symbol: string,
  asOf: string,
): Promise<Record<string, unknown> | null> {
  const query = buildProfileAsOfQuery("ai_trader_symbol_profiles", "symbol", symbol, asOf);
  const rows = await run(executor, query.text, query.params);
  return rows[0] ?? null;
}

export async function findSetupProfileAsOf(
  executor: SqlExecutor,
  setupKey: string,
  asOf: string,
): Promise<Record<string, unknown> | null> {
  const query = buildProfileAsOfQuery("ai_trader_setup_profiles", "setup_key", setupKey, asOf);
  const rows = await run(executor, query.text, query.params);
  return rows[0] ?? null;
}

export async function findRegimeProfileAsOf(
  executor: SqlExecutor,
  regimeKey: string,
  asOf: string,
): Promise<Record<string, unknown> | null> {
  const query = buildProfileAsOfQuery("ai_trader_regime_profiles", "regime_key", regimeKey, asOf);
  const rows = await run(executor, query.text, query.params);
  return rows[0] ?? null;
}

export async function upsertContextSnapshot(
  executor: SqlExecutor,
  row: {
    symbol: string;
    observedAt: string;
    marketSession: string;
    operatingMode: string;
    contextHash: string;
    schemaVersion: string;
    marketState: Record<string, unknown>;
    stocksistSignals: Record<string, unknown>;
    catalystRefs: unknown;
    historicalRefs: unknown;
    sourceProvenance: unknown;
    sessionId?: string | null;
    quoteTimestamp?: string | null;
  },
): Promise<MemoryWriteResult> {
  const inserted = await run(
    executor,
    `INSERT INTO public.ai_trader_context_snapshots (
      session_id, symbol, observed_at, market_session, operating_mode, quote_timestamp,
      market_state_json, stocksist_signals_json, catalyst_refs, historical_refs,
      source_provenance, context_hash, schema_version
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (context_hash, schema_version) DO NOTHING
    RETURNING id`,
    [
      row.sessionId ?? null,
      row.symbol,
      row.observedAt,
      row.marketSession,
      row.operatingMode,
      row.quoteTimestamp ?? null,
      row.marketState,
      row.stocksistSignals,
      row.catalystRefs,
      row.historicalRefs,
      row.sourceProvenance,
      row.contextHash,
      row.schemaVersion,
    ],
  );
  if (inserted[0]?.id) return { id: String(inserted[0].id) };
  const existing = await run(
    executor,
    `SELECT id FROM public.ai_trader_context_snapshots WHERE context_hash = $1 AND schema_version = $2 LIMIT 1`,
    [row.contextHash, row.schemaVersion],
  );
  return { id: String(existing[0]?.id ?? "") };
}
