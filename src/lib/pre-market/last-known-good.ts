/**
 * Section-level last-known-good for Pre-Market workspace refreshes.
 * Only previously contract-validated available/stale snapshots may be kept.
 * Transient QUERY_FAILED must not erase them. Calendar/session failures replace.
 */

import type { PreMarketWorkspaceResponse, SectionEnvelope } from "@/types/pre-market";

export const REFRESH_UNAVAILABLE = "REFRESH_UNAVAILABLE";

/** Transport/query failures that may be masked by a prior validated snapshot. */
export const TRANSIENT_SECTION_REASONS: ReadonlySet<string> = new Set(["QUERY_FAILED"]);

export const LAST_KNOWN_GOOD_SECTIONS = ["watchlist_activity", "headlines"] as const;

export type LastKnownGoodSection = (typeof LAST_KNOWN_GOOD_SECTIONS)[number];

function hasValidatedSnapshot<T>(section: SectionEnvelope<T> | null | undefined): boolean {
  if (!section) return false;
  if (section.status === "available") return true;
  if (section.status === "stale" && section.reason_code === REFRESH_UNAVAILABLE) {
    return section.as_of !== null;
  }
  return false;
}

/**
 * Keep a previously validated envelope when the new envelope is a transient
 * query failure. Never keep unavailable/malformed snapshots. Never keep
 * calendar or session fail-closed results.
 */
export function preserveLastKnownGoodSection<T>(
  previous: SectionEnvelope<T> | null | undefined,
  next: SectionEnvelope<T>,
): SectionEnvelope<T> {
  if (!hasValidatedSnapshot(previous)) return next;
  if (next.status !== "unavailable") return next;
  if (!next.reason_code || !TRANSIENT_SECTION_REASONS.has(next.reason_code)) return next;
  const prior = previous as SectionEnvelope<T>;
  return {
    status: "stale",
    data: prior.data,
    as_of: prior.as_of,
    reason_code: REFRESH_UNAVAILABLE,
  };
}

export function mergeWorkspaceLastKnownGood(
  previous: PreMarketWorkspaceResponse | null | undefined,
  next: PreMarketWorkspaceResponse,
): PreMarketWorkspaceResponse {
  if (!previous) return next;
  return {
    ...next,
    watchlist_activity: preserveLastKnownGoodSection(
      previous.watchlist_activity,
      next.watchlist_activity,
    ),
    headlines: preserveLastKnownGoodSection(previous.headlines, next.headlines),
  };
}
