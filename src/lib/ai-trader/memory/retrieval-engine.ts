import type { RankedMemory } from "@/lib/ai-trader/memory/retrieval-ranking";
import { MEMORY_RETRIEVAL_LIMITS, boundList } from "@/lib/ai-trader/memory/retrieval-limits";
import { rankMemories } from "@/lib/ai-trader/memory/retrieval-ranking";

export interface SimilarityQuery {
  symbol: string | null;
  setupType: string | null;
  regimeKey: string | null;
  asOf: string;
  failuresOnly?: boolean;
}

export interface RetrievedMemoryBundle {
  episodes: readonly RankedMemory[];
  failureExamples: readonly RankedMemory[];
  symbolProfiles: readonly RankedMemory[];
  setupProfiles: readonly RankedMemory[];
  regimeProfiles: readonly RankedMemory[];
}

export interface MemoryRetrievalEngine {
  retrieveSimilarEpisodes(query: SimilarityQuery): Promise<readonly RankedMemory[]>;
  retrieveSymbolContext(symbol: string, asOf: string): Promise<readonly RankedMemory[]>;
  retrieveSetupContext(setupKey: string, asOf: string): Promise<readonly RankedMemory[]>;
  retrieveRegimeContext(regimeKey: string, asOf: string): Promise<readonly RankedMemory[]>;
  retrieveFailureExamples(query: SimilarityQuery): Promise<readonly RankedMemory[]>;
}

export function boundRetrievedBundle(bundle: RetrievedMemoryBundle): RetrievedMemoryBundle {
  return {
    episodes: boundList(rankMemories(bundle.episodes), MEMORY_RETRIEVAL_LIMITS.maxEpisodes),
    failureExamples: boundList(rankMemories(bundle.failureExamples), MEMORY_RETRIEVAL_LIMITS.maxFailureExamples),
    symbolProfiles: boundList(rankMemories(bundle.symbolProfiles), MEMORY_RETRIEVAL_LIMITS.maxSymbolProfiles),
    setupProfiles: boundList(rankMemories(bundle.setupProfiles), MEMORY_RETRIEVAL_LIMITS.maxSetupProfiles),
    regimeProfiles: boundList(rankMemories(bundle.regimeProfiles), MEMORY_RETRIEVAL_LIMITS.maxRegimeProfiles),
  };
}
