import type { SimilarityQuery, RetrievedMemoryBundle } from "@/lib/ai-trader/memory/retrieval-engine";
import { boundRetrievedBundle } from "@/lib/ai-trader/memory/retrieval-engine";
import { combineRetrievalScore, type RankedMemory } from "@/lib/ai-trader/memory/retrieval-ranking";
import { recencyWeight } from "@/lib/ai-trader/memory/retrieval-ranking";
import type { SqlExecutor } from "@/lib/ai-trader/persistence/executor";
import { isUndefinedTableError, MemoryPersistenceError } from "@/lib/ai-trader/persistence/executor";
import { buildSimilarEpisodesQueryBounded } from "@/lib/ai-trader/persistence/retrieval-queries";
import {
  findRegimeProfileAsOf,
  findSetupProfileAsOf,
  findSymbolProfileAsOf,
} from "@/lib/ai-trader/persistence/postgres-memory-provider";

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

function toRankedEpisode(row: Record<string, unknown>, asOf: string, similarity: number): RankedMemory {
  const observedAt = String(row.started_at ?? "");
  const recency = recencyWeight(Date.parse(observedAt), Date.parse(asOf), HALF_LIFE_MS);
  const inputs = {
    similarity,
    recencyWeight: recency,
    evidenceQuality: 0.8,
    regimeSimilarity: row.market_regime ? 0.8 : 0.4,
    sampleReliability: 0.7,
  };
  return {
    memoryId: String(row.id ?? ""),
    kind: "OBSERVATION",
    sourceTable: "ai_trader_episodes",
    sourceId: String(row.id ?? ""),
    observedAt,
    relevanceInputs: inputs,
    combinedScore: combineRetrievalScore(inputs),
    supersededBy: null,
    stale: Date.parse(observedAt) > Date.parse(asOf),
    payload: row,
  };
}

function toRankedProfile(row: Record<string, unknown>, sourceTable: string): RankedMemory {
  return {
    memoryId: String(row.id ?? ""),
    kind: "LEARNED_BELIEF",
    sourceTable,
    sourceId: String(row.id ?? ""),
    observedAt: String(row.generated_at ?? ""),
    relevanceInputs: {
      similarity: 1,
      recencyWeight: 1,
      evidenceQuality: 1,
      regimeSimilarity: 1,
      sampleReliability: 1,
    },
    combinedScore: 1,
    supersededBy: row.supersedes_id == null ? null : String(row.supersedes_id),
    stale: false,
    payload: row,
  };
}

export async function retrieveStructuredMemories(
  executor: SqlExecutor,
  query: SimilarityQuery,
): Promise<RetrievedMemoryBundle> {
  try {
    const similar = buildSimilarEpisodesQueryBounded({ ...query, failuresOnly: false });
    const failures = buildSimilarEpisodesQueryBounded({ ...query, failuresOnly: true });
    const [episodeRows, failureRows, symbol, setup, regime] = await Promise.all([
      executor.query(similar.text, similar.params),
      executor.query(failures.text, failures.params),
      query.symbol ? findSymbolProfileAsOf(executor, query.symbol, query.asOf) : Promise.resolve(null),
      query.setupType ? findSetupProfileAsOf(executor, query.setupType, query.asOf) : Promise.resolve(null),
      query.regimeKey ? findRegimeProfileAsOf(executor, query.regimeKey, query.asOf) : Promise.resolve(null),
    ]);
    return boundRetrievedBundle({
      episodes: episodeRows.map((row) => toRankedEpisode(row, query.asOf, 0.8)),
      failureExamples: failureRows.map((row) => toRankedEpisode(row, query.asOf, 0.7)),
      symbolProfiles: symbol ? [toRankedProfile(symbol, "ai_trader_symbol_profiles")] : [],
      setupProfiles: setup ? [toRankedProfile(setup, "ai_trader_setup_profiles")] : [],
      regimeProfiles: regime ? [toRankedProfile(regime, "ai_trader_regime_profiles")] : [],
    });
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw new MemoryPersistenceError("TABLES_NOT_APPLIED", "Structured retrieval requires the reviewed migration.");
    }
    throw error;
  }
}
