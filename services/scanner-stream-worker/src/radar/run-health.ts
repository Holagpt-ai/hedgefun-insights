import type { PublishRadarResult } from "./persist_v2.ts";
import type { RadarHealthSnapshot } from "./types.ts";

/**
 * Loop health after one eval/publish cycle.
 * Unresolved persistence failures stay degraded through backoff skips until a
 * successful applicable write clears telemetry in run.ts.
 */
export function resolveRadarLoopHealth(input: {
  leaseHeld: boolean;
  feedStale: boolean;
  persistenceV2Enabled: boolean;
  v2: PublishRadarResult | "skipped";
  v1Attempted: boolean;
  v1Ok: boolean;
  unresolvedPersistFailure: boolean;
}): RadarHealthSnapshot["status"] {
  if (input.unresolvedPersistFailure) return "degraded";
  if (input.v1Attempted && !input.v1Ok) return "degraded";
  if (input.persistenceV2Enabled && input.v2 !== "skipped" && !input.v2.ok) {
    return "degraded";
  }
  if (!input.leaseHeld) return "degraded";
  if (input.feedStale) return "stale";
  return "running";
}
