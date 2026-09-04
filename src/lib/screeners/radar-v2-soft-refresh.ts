/**
 * Shared Radar V2 soft-refresh retain rule (D11.2 / D13).
 *
 * A previously verified Radar V2 board must survive a transient background
 * poll failure. Hard/initial loads always apply. A valid available generation
 * and a healthy empty generation always replace.
 */

import { radarV2ReasonFamily } from "@/lib/screeners/radar-v2-diagnostics";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";

/** Transient loader failures that must not destroy a verified Radar V2 board. */
export const RADAR_V2_SOFT_REFRESH_PRESERVE_REASONS = [
  "radar_v2_fetch_error",
  "radar_v2_fetch_threw",
  "radar_v2_retry_exhausted",
  "generation_race",
] as const;

export function isVerifiedRadarV2Decision(
  decision: RadarV2Decision | null | undefined,
): decision is RadarV2Decision & { source: "radar-v2"; view: NonNullable<RadarV2Decision["view"]> } {
  return !!decision && decision.source === "radar-v2" && decision.view !== null;
}

export function isTransientRadarV2SoftFailure(decision: RadarV2Decision): boolean {
  if (decision.source === "radar-v2") return false;
  const family = radarV2ReasonFamily(decision.reason);
  return (RADAR_V2_SOFT_REFRESH_PRESERVE_REASONS as readonly string[]).includes(family);
}

export function shouldPreserveVerifiedRadarV2OnSoftRefresh(input: {
  soft: boolean;
  next: RadarV2Decision;
  prior: RadarV2Decision | null;
}): boolean {
  if (!input.soft) return false;
  if (!isVerifiedRadarV2Decision(input.prior)) return false;
  return isTransientRadarV2SoftFailure(input.next);
}

export function radarV2FetchThrewDecision(): RadarV2Decision {
  return { source: "fallback", reason: "radar_v2_fetch_threw", session: null, view: null };
}
