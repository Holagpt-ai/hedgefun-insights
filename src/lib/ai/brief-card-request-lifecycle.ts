import type { BriefType } from "@/lib/ai/brief-refresh-state";
import type { LastGoodBriefCache } from "@/lib/ai/brief-refresh-state";
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

export function clearScopedLastGoodBrief(cache: LastGoodBriefCache): void {
  cache.am = null;
  cache.pm = null;
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