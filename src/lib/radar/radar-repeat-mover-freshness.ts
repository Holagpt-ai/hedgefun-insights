import {
  radarRepeatMoversConfig,
  type RadarRepeatMoversConfig,
} from "@/config/radar-repeat-movers.config";
import type { RepeatMoverProfileSnapshot } from "@/types/repeat-mover";
import type { RadarRepeatMoverProfileFreshnessState } from "@/lib/radar/radar-repeat-movers-types";

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Marks profile stale from age or coverage gap vs profile historyEndDate.
 * Does not recompute profiles on the Radar request path.
 */
export function deriveRepeatMoverProfileFreshness(input: {
  profile: RepeatMoverProfileSnapshot;
  nowMs: number;
  config?: Partial<RadarRepeatMoversConfig>;
}): RadarRepeatMoverProfileFreshnessState {
  if (!input.profile.profileAvailable) return "UNKNOWN";

  const config = radarRepeatMoversConfig(input.config);
  const computedMs = parseIsoMs(input.profile.computedAt);
  if (computedMs === null) return "UNKNOWN";

  if (input.nowMs - computedMs > config.staleProfileMaxAgeMs) {
    return "STALE";
  }

  const latestSource = input.profile.latestSourceHistoryDate;
  const historyEnd = input.profile.historyEndDate;
  if (
    latestSource
    && historyEnd
    && latestSource < historyEnd
  ) {
    return "STALE";
  }

  return "FRESH";
}
