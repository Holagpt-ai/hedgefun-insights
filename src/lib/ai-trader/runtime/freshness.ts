import type { MarketCandidate } from "@/lib/ai-trader/market/candidate";
import { SHADOW_RUNTIME_CONFIG } from "@/lib/ai-trader/runtime/config";

export type FreshnessRejection = "STALE_SOURCE_DATA" | "FUTURE_EVIDENCE" | "PRIOR_SESSION_NOT_CURRENT";

export function candidateObservedAt(candidate: MarketCandidate): string | null {
  return candidate.provenance.providerAsOf ?? candidate.provenance.radarUpdatedAt;
}

export function assessCandidateFreshness(
  candidate: MarketCandidate,
  cycleNowMs: number,
  surveillanceDate: string | null,
): FreshnessRejection | null {
  const observedAt = candidateObservedAt(candidate);
  if (observedAt) {
    const observedMs = Date.parse(observedAt);
    if (Number.isFinite(observedMs) && observedMs > cycleNowMs) return "FUTURE_EVIDENCE";
    if (Number.isFinite(observedMs) && cycleNowMs - observedMs > SHADOW_RUNTIME_CONFIG.staleAfterMs) {
      return "STALE_SOURCE_DATA";
    }
  }
  if (candidate.quality.feedStatus === "stale") return "STALE_SOURCE_DATA";
  if (
    surveillanceDate &&
    candidate.surveillanceDate &&
    candidate.surveillanceDate !== surveillanceDate
  ) {
    return "PRIOR_SESSION_NOT_CURRENT";
  }
  return null;
}
