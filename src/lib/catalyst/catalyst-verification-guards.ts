import {
  isAnnouncedLifecycle,
  isScheduleOnlyLifecycle,
  readIntelFactsFromEvent,
  type IntelVerificationState,
} from "@/lib/catalyst/catalyst-intel-facts";
import { scheduledMomentMs } from "@/lib/catalyst/parsers";
import type { CatalystEvent } from "@/types/catalyst";

export const ROUTINE_FILING_MATERIALITY_CEILING = 40;

const BLOCKED_VERIFICATION: ReadonlySet<IntelVerificationState> = new Set([
  "UNVERIFIED",
  "CONFLICTING",
  "INVALIDATED",
]);

export function hasPublicationEvidence(event: CatalystEvent): boolean {
  if (event.published_at && Number.isFinite(Date.parse(event.published_at))) return true;
  const { lifecycle } = readIntelFactsFromEvent(event);
  return isAnnouncedLifecycle(lifecycle);
}

/**
 * Scheduled calendar rows (future event_time/event_date) are not confirmed announcements.
 */
export function isFutureScheduledOnly(event: CatalystEvent, nowMs: number): boolean {
  const scheduled = scheduledMomentMs(event);
  if (scheduled === null || scheduled <= nowMs) return false;
  const { lifecycle } = readIntelFactsFromEvent(event);
  if (isAnnouncedLifecycle(lifecycle)) return false;
  if (hasPublicationEvidence(event) && event.published_at) return false;
  return true;
}

export function isRoutineLowMaterialityFiling(event: CatalystEvent): boolean {
  if (event.event_type !== "sec_filing_news") return false;
  const { materiality } = readIntelFactsFromEvent(event);
  if (materiality === null) return false;
  return materiality <= ROUTINE_FILING_MATERIALITY_CEILING;
}

/** Whether the row may be treated as a direct, evidence-backed catalyst for display enrichment. */
export function passesDirectCatalystVerificationGuard(event: CatalystEvent, nowMs: number): boolean {
  if (event.attribution_class === "sector_related" || event.attribution_class === "unverified") {
    return false;
  }
  if (event.ticker_specific === false) return false;

  const intel = readIntelFactsFromEvent(event);
  if (intel.providerTickerConflict) return false;

  const { verification } = intel;
  if (verification && BLOCKED_VERIFICATION.has(verification)) return false;

  if (isFutureScheduledOnly(event, nowMs)) return false;
  if (isRoutineLowMaterialityFiling(event)) return false;

  return true;
}

/**
 * Recent enrichment requires confirmed announcement evidence, not a future schedule slot alone.
 */
export function passesRecentEnrichmentGuard(event: CatalystEvent, nowMs: number): boolean {
  if (!passesDirectCatalystVerificationGuard(event, nowMs)) return false;
  if (isFutureScheduledOnly(event, nowMs)) return false;
  const scheduled = scheduledMomentMs(event);
  const published = event.published_at ? Date.parse(event.published_at) : NaN;
  if (scheduled !== null && scheduled < nowMs && !Number.isFinite(published) && !hasPublicationEvidence(event)) {
    return false;
  }
  return true;
}
