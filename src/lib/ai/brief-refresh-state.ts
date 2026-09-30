/**
 * Preserve the last successful brief when a refresh fails so the UI can stay honest.
 */

import type {
  AmBriefFreshnessState,
  AmGenerationWindow,
} from "@/lib/pre-market/am-brief-freshness";

export type BriefType = "am" | "pm";

export type LastGoodBriefCache = {
  am: CachedBriefSnapshot | null;
  pm: CachedBriefSnapshot | null;
};

export function emptyLastGoodBriefCache(): LastGoodBriefCache {
  return { am: null, pm: null };
}

export function getCachedBrief(
  cache: LastGoodBriefCache,
  briefType: BriefType,
): CachedBriefSnapshot | null {
  return cache[briefType];
}

export function setCachedBrief(
  cache: LastGoodBriefCache,
  briefType: BriefType,
  snapshot: CachedBriefSnapshot,
): void {
  cache[briefType] = snapshot;
}

export type CachedBriefSnapshot = {
  content: string;
  generatedAtEt: string;
  previousTradingDay: boolean;
  briefDateDisplay: string | null;
  evidenceCutoff: string | null;
  freshnessState: AmBriefFreshnessState;
  generationWindow: AmGenerationWindow | null;
  expectedGenerationWindow: AmGenerationWindow | null;
  supersededBy: AmGenerationWindow | null;
  ageSeconds: number;
  generationReason: string | null;
};

export function staleRefreshNotice(generatedAtEt: string): string {
  return `Showing last successful brief from ${generatedAtEt} ET — refresh did not complete.`;
}

export function shouldPreserveBriefOnRefreshFailure(
  cached: CachedBriefSnapshot | null,
  httpStatus: number,
  available: boolean,
  briefType: BriefType,
  cachedBriefType?: BriefType | null,
): boolean {
  if (!cached) return false;
  if (cachedBriefType && cachedBriefType !== briefType) return false;
  if (available) return false;
  if (httpStatus === 401 || httpStatus === 403) return false;
  return true;
}
