import type { MemoryKind } from "@/lib/ai-trader/domain/memory";

export const RETRIEVAL_RANKING_VERSION = "v1-inputs";

/**
 * Ranking inputs only. Weights are a replaceable extension boundary,
 * not a live-money formula.
 */
export interface RetrievalRelevanceInputs {
  similarity: number | null;
  recencyWeight: number | null;
  evidenceQuality: number | null;
  regimeSimilarity: number | null;
  sampleReliability: number | null;
}

export interface RetrievalRankingWeights {
  version: string;
  similarity: number;
  recencyWeight: number;
  evidenceQuality: number;
  regimeSimilarity: number;
  sampleReliability: number;
}

export const DEFAULT_RETRIEVAL_WEIGHTS: RetrievalRankingWeights = {
  version: RETRIEVAL_RANKING_VERSION,
  similarity: 1,
  recencyWeight: 1,
  evidenceQuality: 1,
  regimeSimilarity: 1,
  sampleReliability: 1,
};

export interface RankedMemory {
  memoryId: string;
  kind: MemoryKind;
  sourceTable: string;
  sourceId: string;
  observedAt: string;
  relevanceInputs: RetrievalRelevanceInputs;
  combinedScore: number | null;
  supersededBy: string | null;
  stale: boolean;
  payload: Record<string, unknown>;
}

export function recencyWeight(observedAtMs: number, asOfMs: number, halfLifeMs: number): number {
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(asOfMs) || !Number.isFinite(halfLifeMs)) return 0;
  if (halfLifeMs <= 0) return 0;
  const age = Math.max(0, asOfMs - observedAtMs);
  return Math.pow(0.5, age / halfLifeMs);
}

export function combineRetrievalScore(
  inputs: RetrievalRelevanceInputs,
  weights: RetrievalRankingWeights = DEFAULT_RETRIEVAL_WEIGHTS,
): number | null {
  if (inputs.similarity === null) return null;
  const factors: Array<[number | null, number]> = [
    [inputs.similarity, weights.similarity],
    [inputs.recencyWeight, weights.recencyWeight],
    [inputs.evidenceQuality, weights.evidenceQuality],
    [inputs.regimeSimilarity, weights.regimeSimilarity],
    [inputs.sampleReliability, weights.sampleReliability],
  ];
  let score = 1;
  let used = 0;
  for (const [value, weight] of factors) {
    if (value === null) continue;
    score *= Math.max(0, value) * weight;
    used += 1;
  }
  return used === 0 ? null : score;
}

export function isEligibleAt(asOf: string, observedAt: string, supersededBy: string | null, supersededAt: string | null): boolean {
  if (supersededBy === null || supersededAt === null) return true;
  return asOf < supersededAt;
}

export function compareRankedMemories(a: RankedMemory, b: RankedMemory): number {
  const aScore = a.combinedScore ?? -1;
  const bScore = b.combinedScore ?? -1;
  if (bScore !== aScore) return bScore - aScore;
  return b.observedAt.localeCompare(a.observedAt);
}

export function rankMemories(items: readonly RankedMemory[]): RankedMemory[] {
  return [...items].sort(compareRankedMemories);
}
