import { candidatesPreserveSourceRank, type MarketCandidate } from "@/lib/ai-trader/market/candidate";

export interface CandidateFilterInput {
  requireFiniteVolume?: boolean;
  excludeStale?: boolean;
  excludeInactiveLifecycle?: boolean;
}

const INACTIVE_LIFECYCLES = new Set(["COOLING"]);

export function filterEligibleCandidates(
  candidates: readonly MarketCandidate[],
  input: CandidateFilterInput = {},
): readonly MarketCandidate[] {
  const filtered = candidates.filter((candidate) => {
    if (!/^[A-Z][A-Z0-9.-]*$/.test(candidate.symbol)) return false;
    if (!Number.isInteger(candidate.sourceRank) || candidate.sourceRank < 1) return false;
    if (input.requireFiniteVolume !== false) {
      if (candidate.volume == null || !Number.isFinite(candidate.volume) || candidate.volume <= 0) {
        return false;
      }
    }
    if (input.excludeStale && candidate.quality.feedStatus === "stale") return false;
    if (input.excludeInactiveLifecycle && candidate.lifecycle && INACTIVE_LIFECYCLES.has(candidate.lifecycle)) {
      return false;
    }
    return true;
  });
  if (!candidatesPreserveSourceRank(filtered)) {
    throw new Error("candidate filter must not reorder Radar sourceRank");
  }
  return filtered;
}
