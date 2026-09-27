import type { AiTraderCounterfactual, AiTraderReflection } from "@/lib/ai-trader/domain/reflections";
import type { DecisionId, TradeId } from "@/lib/ai-trader/domain/ids";

export interface ReflectionEngine {
  reflectOnTrade(tradeId: TradeId): Promise<AiTraderReflection>;
  reflectOnPassedTrade(decisionId: DecisionId): Promise<AiTraderReflection>;
  reflectOnRiskRejection(decisionId: DecisionId): Promise<AiTraderReflection>;
  generateCounterfactuals(tradeId: TradeId): Promise<readonly AiTraderCounterfactual[]>;
}
