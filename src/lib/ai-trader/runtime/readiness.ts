import type { MarketIntelligenceAdapter } from "@/lib/ai-trader/market/intelligence-adapter";
import type { ShadowPersistence } from "@/lib/ai-trader/runtime/shadow-persistence";
import type { ShadowReadinessResult } from "@/lib/ai-trader/runtime/contracts";

export interface ShadowReadinessInput {
  runtimeSchemaPresent: boolean;
  watchlistSchemaPresent: boolean;
  marketAdapter: MarketIntelligenceAdapter | null;
  sessionPolicyAvailable: boolean;
  persistence: ShadowPersistence | null;
  operatingModeReadable: boolean;
  transitionRpcPresent: boolean;
}

export function evaluateShadowReadiness(input: ShadowReadinessInput): ShadowReadinessResult {
  const reasons: string[] = [];
  if (!input.runtimeSchemaPresent) reasons.push("RUNTIME_SCHEMA_MISSING");
  if (!input.watchlistSchemaPresent) reasons.push("WATCHLIST_SCHEMA_MISSING");
  if (!input.marketAdapter) reasons.push("MARKET_ADAPTER_MISSING");
  if (!input.sessionPolicyAvailable) reasons.push("SESSION_POLICY_MISSING");
  if (!input.persistence) reasons.push("PERSISTENCE_MISSING");
  if (!input.operatingModeReadable) reasons.push("OPERATING_MODE_UNREADABLE");
  if (!input.transitionRpcPresent) reasons.push("TRANSITION_RPC_MISSING");
  reasons.push("BROKER_NOT_REQUIRED");
  reasons.push("MODEL_NOT_REQUIRED");
  const blocking = reasons.filter((reason) => !reason.endsWith("_NOT_REQUIRED"));
  return {
    status: blocking.length === 0 ? "READY" : "NOT_READY",
    reasons,
  };
}
