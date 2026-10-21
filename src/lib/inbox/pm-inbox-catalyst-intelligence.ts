/**
 * PM Inbox catalyst rows — today's session activity with Batch 29 verification guards.
 */

import { hydrateCatalystEventVerification } from "@/lib/catalyst/catalyst-event-verification";
import { passesDirectCatalystVerificationGuard } from "@/lib/catalyst/catalyst-verification-guards";
import type { CatalystAvailability } from "@/lib/catalyst/intelligence-v2";
import {
  PM_CATALYST_ACTIVITY_LIMIT,
  selectPmCatalystActivity,
} from "@/lib/catalyst/pm-catalyst-activity";
import type { CatalystEvent } from "@/types/catalyst";

export function pmCatalystAvailabilityForEvent(
  event: CatalystEvent,
  nowMs: number,
): CatalystAvailability {
  const hydrated = hydrateCatalystEventVerification(event);
  if (!passesDirectCatalystVerificationGuard(hydrated, nowMs)) return "none";
  return "verified";
}

export function selectPmInboxVerifiedCatalystActivity<T extends CatalystEvent>(
  events: T[],
  nowMs: number,
  limit = PM_CATALYST_ACTIVITY_LIMIT,
): T[] {
  if (!Array.isArray(events) || limit <= 0) return [];
  const pool = selectPmCatalystActivity(events, nowMs, Math.max(limit * 4, limit));
  const verified: T[] = [];
  for (const row of pool) {
    if (pmCatalystAvailabilityForEvent(row, nowMs) !== "verified") continue;
    verified.push(row);
    if (verified.length >= limit) break;
  }
  return verified;
}

export function pmInboxCatalystSectionState(input: {
  loading: boolean;
  error: boolean;
  verifiedCount: number;
}): CatalystAvailability | "pending" {
  if (input.error) return "unavailable";
  if (input.loading) return "pending";
  return input.verifiedCount > 0 ? "verified" : "none";
}
