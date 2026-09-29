import { canonicalIntelligenceEventType, type IntelligenceEventType } from "@/lib/scanner-intelligence/event-model";

/**
 * A claimed handoff event is evidence only when the same canonical type is
 * already stored on radar. The URL string alone is ignored.
 */
export function confirmStoredScannerEvent(
  claimed: string | null | undefined,
  stored: readonly (string | null | undefined)[],
): IntelligenceEventType | null {
  const claim = canonicalIntelligenceEventType(claimed);
  if (!claim) return null;
  for (const value of stored) {
    if (canonicalIntelligenceEventType(value) === claim) return claim;
  }
  return null;
}
