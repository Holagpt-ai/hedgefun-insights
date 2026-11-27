import type { BriefType, CachedBriefSnapshot } from "@/lib/ai/brief-refresh-state";

const STORAGE_PREFIX = "stocksist_brief_session_v1";

function storageKey(briefType: BriefType, tradingDateEt: string): string {
  return `${STORAGE_PREFIX}:${briefType}:${tradingDateEt}`;
}

export function readBriefSessionCache(
  briefType: BriefType,
  tradingDateEt: string,
): CachedBriefSnapshot | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(briefType, tradingDateEt));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBriefSnapshot;
    if (typeof parsed?.content !== "string" || !parsed.content.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBriefSessionCache(
  briefType: BriefType,
  tradingDateEt: string,
  snapshot: CachedBriefSnapshot,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(briefType, tradingDateEt), JSON.stringify(snapshot));
  } catch {
    // Quota or privacy mode — ignore.
  }
}