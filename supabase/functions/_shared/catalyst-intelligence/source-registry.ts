import type { SourceRecord } from "./types.ts";

export function selectDueSources(
  sources: readonly SourceRecord[],
  now: Date,
  limit: number,
  allowlist?: readonly string[],
): SourceRecord[] {
  const nowMs = now.getTime();
  return sources
    .filter((source) => source.enabled)
    .filter((source) => {
      if (!allowlist || allowlist.length === 0) return true;
      return allowlist.includes(source.sourceKey) || allowlist.includes(source.id);
    })
    .filter((source) => !source.backoffUntil || Date.parse(source.backoffUntil) <= nowMs)
    .filter((source) => {
      if (!source.lastSuccessAt) return true;
      const elapsed = nowMs - Date.parse(source.lastSuccessAt);
      return elapsed >= source.pollIntervalSeconds * 1000;
    })
    .sort((a, b) => b.priority - a.priority || a.sourceKey.localeCompare(b.sourceKey))
    .slice(0, Math.max(0, limit));
}
