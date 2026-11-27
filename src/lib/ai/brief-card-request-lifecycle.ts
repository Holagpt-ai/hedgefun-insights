import type { BriefType, LastGoodBriefCache } from "@/lib/ai/brief-refresh-state";
import { emptyLastGoodBriefCache } from "@/lib/ai/brief-refresh-state";
import type { AmGenerationWindow } from "@/lib/pre-market/am-brief-freshness";
import { expectedGenerationWindow, windowRank } from "@/lib/pre-market/am-brief-freshness";
import { getEtParts } from "@/lib/market-calendar";

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

/** Early-window brief must not satisfy the card when the live schedule expects a newer window. */
export function briefSnapshotSupersededBySchedule(input: {
  briefType: BriefType;
  generationWindow: AmGenerationWindow | null;
  now?: Date;
}): boolean {
  if (input.briefType !== "am") return false;
  if (!input.generationWindow) return false;
  const minutesEt = getEtParts(input.now ?? new Date()).minutes;
  const expectedNow = expectedGenerationWindow(minutesEt);
  if (!expectedNow) return false;
  return windowRank(expectedNow) > windowRank(input.generationWindow);
}

/** Fetch response may mutate UI/cache only while generation, user, brief type and session align. */
export function briefFetchStillValid(input: {
  generation: number;
  activeGeneration: number;
  capturedUserId: string;
  capturedBriefType: BriefType;
  liveUserId: string | undefined;
  liveBriefType: BriefType;
  sessionUserId?: string | null;
}): boolean {
  if (input.activeGeneration !== input.generation) return false;
  if (input.liveUserId !== input.capturedUserId) return false;
  if (input.liveBriefType !== input.capturedBriefType) return false;
  if (input.sessionUserId != null && input.sessionUserId !== input.capturedUserId) return false;
  return true;
}

export function emptyBriefCacheWithScope(): {
  cache: LastGoodBriefCache;
  ownerKey: string | null;
} {
  return { cache: emptyLastGoodBriefCache(), ownerKey: null };
}