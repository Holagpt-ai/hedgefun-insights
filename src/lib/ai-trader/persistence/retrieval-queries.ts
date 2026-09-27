import { MEMORY_RETRIEVAL_LIMITS } from "@/lib/ai-trader/memory/retrieval-limits";

export const FAILURE_EPISODE_PREDICATE = `(
  outcome IN ('LOSS', 'STOP_OUT', 'FAILED', 'REJECTED')
  OR episode_type = 'RISK_REJECTION'
)`;

export interface EpisodeQueryInput {
  symbol: string | null;
  setupType: string | null;
  regimeKey: string | null;
  asOf: string;
  failuresOnly?: boolean;
  limit: number;
}

export interface BuiltQuery {
  text: string;
  params: unknown[];
}

export function buildSimilarEpisodesQuery(input: EpisodeQueryInput): BuiltQuery {
  const params: unknown[] = [input.asOf];
  const clauses = ["started_at <= $1"];
  if (input.symbol) {
    params.push(input.symbol);
    clauses.push(`symbol = $${params.length}`);
  }
  if (input.setupType) {
    params.push(input.setupType);
    clauses.push(`setup_type = $${params.length}`);
  }
  if (input.regimeKey) {
    params.push(input.regimeKey);
    clauses.push(`market_regime = $${params.length}`);
  }
  if (input.failuresOnly) clauses.push(FAILURE_EPISODE_PREDICATE);
  params.push(input.limit);
  return {
    text: `SELECT * FROM public.ai_trader_episodes WHERE ${clauses.join(" AND ")} ORDER BY started_at DESC LIMIT $${params.length}`,
    params,
  };
}

export function buildSimilarEpisodesQueryBounded(input: Omit<EpisodeQueryInput, "limit">): BuiltQuery {
  return buildSimilarEpisodesQuery({
    ...input,
    limit: input.failuresOnly ? MEMORY_RETRIEVAL_LIMITS.maxFailureExamples : MEMORY_RETRIEVAL_LIMITS.maxEpisodes,
  });
}

export function buildProfileAsOfQuery(
  table: "ai_trader_symbol_profiles" | "ai_trader_setup_profiles" | "ai_trader_regime_profiles",
  keyColumn: "symbol" | "setup_key" | "regime_key",
  keyValue: string,
  asOf: string,
): BuiltQuery {
  return {
    text: `SELECT * FROM public.${table} WHERE ${keyColumn} = $1 AND generated_at <= $2 ORDER BY generated_at DESC LIMIT $3`,
    params: [keyValue, asOf, MEMORY_RETRIEVAL_LIMITS.maxSymbolProfiles],
  };
}

export function buildContextDedupeLookup(contextHash: string, schemaVersion: string): BuiltQuery {
  return {
    text: `SELECT id FROM public.ai_trader_context_snapshots WHERE context_hash = $1 AND schema_version = $2 LIMIT 1`,
    params: [contextHash, schemaVersion],
  };
}

export function profileQueryUsesCurrentFlag(text: string): boolean {
  return /is_current/i.test(text);
}

export function queryHasVectorOrEmbedding(text: string): boolean {
  return /pgvector|embedding|<=>|<->|<#>|plainto_tsquery/i.test(text);
}
