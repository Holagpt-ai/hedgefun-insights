import type { PublishRadarResult } from "./persist_v2.ts";
import type { RadarHealthSnapshot } from "./types.ts";

/** Never report running when the authoritative V2 write failed. */
export function resolveRadarLoopHealth(input: {
  leaseHeld: boolean;
  feedStale: boolean;
  persistenceV2Enabled: boolean;
  v2: PublishRadarResult | "skipped";
  v1Attempted: boolean;
  v1Ok: boolean;
}): RadarHealthSnapshot["status"] {
  if (input.persistenceV2Enabled) {
    if (input.v2 !== "skipped" && !input.v2.ok) return "degraded";
  } else if (input.v1Attempted && !input.v1Ok) {
    return "degraded";
  }
  if (!input.leaseHeld) return "degraded";
  if (input.feedStale) return "stale";
  return "running";
}
