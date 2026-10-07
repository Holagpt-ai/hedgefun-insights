import type { ShadowOpportunityRecord } from "@/lib/execution/shadow/shadow-opportunity";

export function parseIsoTimestampMs(iso: string | null | undefined): number | null {
  if (iso == null || typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

export function opportunitySignalTimestampMs(record: ShadowOpportunityRecord): number | null {
  return parseIsoTimestampMs(record.signal.signalAt);
}

/** Newest signal first; rows with valid timestamps before rows with missing/invalid timestamps. */
export function compareOpportunitiesNewestFirst(
  a: ShadowOpportunityRecord,
  b: ShadowOpportunityRecord,
): number {
  const ta = opportunitySignalTimestampMs(a);
  const tb = opportunitySignalTimestampMs(b);
  if (ta != null && tb != null) return tb - ta;
  if (ta != null && tb == null) return -1;
  if (ta == null && tb != null) return 1;
  return 0;
}

export function sortShadowOpportunitiesForDisplay(
  records: readonly ShadowOpportunityRecord[],
): ShadowOpportunityRecord[] {
  return [...records].sort(compareOpportunitiesNewestFirst);
}

/** Oldest first for symbol/event timelines; valid timestamps before missing/invalid. */
export function compareTimestampsOldestFirst(a: string, b: string): number {
  const ta = parseIsoTimestampMs(a);
  const tb = parseIsoTimestampMs(b);
  if (ta != null && tb != null) return ta - tb;
  if (ta != null && tb == null) return -1;
  if (ta == null && tb != null) return 1;
  return 0;
}
