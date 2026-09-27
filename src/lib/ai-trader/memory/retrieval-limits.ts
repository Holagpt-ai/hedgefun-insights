export const MEMORY_RETRIEVAL_LIMITS = {
  maxEpisodes: 8,
  maxFailureExamples: 3,
  maxSymbolProfiles: 1,
  maxSetupProfiles: 1,
  maxRegimeProfiles: 1,
} as const;

export type MemoryRetrievalLimits = typeof MEMORY_RETRIEVAL_LIMITS;

export function boundList<T>(items: readonly T[], max: number): T[] {
  return items.slice(0, Math.max(0, max));
}
