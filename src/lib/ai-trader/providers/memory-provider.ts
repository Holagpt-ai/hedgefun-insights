import type { EpisodeId, ObservationId } from "@/lib/ai-trader/domain/ids";
import type {
  AiTraderEpisode,
  AiTraderObservation,
  AiTraderRegimeProfile,
  AiTraderSetupProfile,
  AiTraderSymbolProfile,
} from "@/lib/ai-trader/domain/memory";

export interface MemoryWriteResult {
  id: string;
}

/**
 * Replaceable persistence boundary.
 * V1 intends Postgres. No provider is constructed in this sprint.
 */
export interface MemoryProvider {
  id: string;
  recordObservation(observation: AiTraderObservation): Promise<MemoryWriteResult>;
  recordEpisode(episode: AiTraderEpisode): Promise<MemoryWriteResult>;
  getObservation(id: ObservationId): Promise<AiTraderObservation | null>;
  getEpisode(id: EpisodeId): Promise<AiTraderEpisode | null>;
  listEpisodesBySymbol(symbol: string, asOf: string): Promise<readonly AiTraderEpisode[]>;
  getCurrentSymbolProfile(symbol: string): Promise<AiTraderSymbolProfile | null>;
  getCurrentSetupProfile(setupKey: string): Promise<AiTraderSetupProfile | null>;
  getCurrentRegimeProfile(regimeKey: string): Promise<AiTraderRegimeProfile | null>;
}

export type MemoryProviderKind = "postgres" | "vector" | "hybrid" | "future";
