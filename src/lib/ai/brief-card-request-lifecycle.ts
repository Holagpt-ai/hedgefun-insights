import type { BriefType, LastGoodBriefCache } from "@/lib/ai/brief-refresh-state";
import { emptyLastGoodBriefCache } from "@/lib/ai/brief-refresh-state";
import type { AmGenerationWindow } from "@/lib/pre-market/am-brief-freshness";
import { windowRank } from "@/lib/pre-market/am-brief-freshness";

export type BriefCacheScope = {
  userId: string;
  briefType: BriefType;
};

export function briefCacheScopeKey(scope: BriefCacheScope): string {
  return `${scope.userId}:${scope.briefType}`;
}

/** In-memory last-good brief is valid only for the same authenticated user + card. */
export function lastGoodBriefUsable(
  scope: BriefCacheScope | null,
  ownerKey: string | null,
): boolean {
  if (!scope?.userId || !ownerKey) return false;
  return ownerKey === briefCacheScopeKey(scope);
}

export function clearScopedLastGoodBrief(cache: LastGoodBriefCache): void {
  cache.am = null;
  cache.pm = null;
}

export function resetBriefRequestGeneration(gen: { current: number }): number {
  gen.current += 1;
  return gen.current;
}

/** Only the active fetch generation may release the in-flight guard. */
export function shouldReleaseBriefInFlightGuard(
  activeGeneration: number,
  completedGeneration: number,
): boolean {
  return activeGeneration === completedGeneration;
}

/** Early-window brief must not satisfy the card when a later window is already expected. */
export function briefSnapshotSupersededBySchedule(input: {
  briefType: BriefType;
  generationWindow: AmGenerationWindow | null;
  expectedGenerationWindow: AmGenerationWindow | null;
}): boolean {
  if (input.briefType !== "am") return false;
  if (!input.generationWindow || !input.expectedGenerationWindow) return false;
  return windowRank(input.expectedGenerationWindow) > windowRank(input.generationWindow);
}

export function emptyBriefCacheWithScope(): {
  cache: LastGoodBriefCache;
  ownerKey: string | null;
} {
  return { cache: emptyLastGoodBriefCache(), ownerKey: null };
}