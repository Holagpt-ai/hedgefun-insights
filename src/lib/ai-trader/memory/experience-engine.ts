import type { MemoryWriteResult } from "@/lib/ai-trader/providers/memory-provider";
import type { AiTraderEpisode, AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { DecisionId, EpisodeId, RiskDecisionId } from "@/lib/ai-trader/domain/ids";

export interface DecisionOutcomeDraft {
  decisionId: DecisionId;
  episode: AiTraderEpisode;
}

export interface TradeOutcomeDraft {
  episode: AiTraderEpisode;
}

export interface PassDraft {
  episode: AiTraderEpisode;
}

export interface RiskRejectionDraft {
  riskDecisionId: RiskDecisionId;
  episode: AiTraderEpisode;
}

export interface WatchlistOutcomeDraft {
  episode: AiTraderEpisode;
}

export interface ExperienceEngine {
  recordObservation(input: AiTraderObservation): Promise<MemoryWriteResult>;
  recordEpisode(input: AiTraderEpisode): Promise<MemoryWriteResult>;
  recordDecisionOutcome(input: DecisionOutcomeDraft): Promise<{ id: EpisodeId }>;
  recordTradeOutcome(input: TradeOutcomeDraft): Promise<{ id: EpisodeId }>;
  recordPassedOpportunity(input: PassDraft): Promise<{ id: EpisodeId }>;
  recordRiskRejection(input: RiskRejectionDraft): Promise<{ id: EpisodeId }>;
  recordWatchlistOutcome(input: WatchlistOutcomeDraft): Promise<{ id: EpisodeId }>;
}
