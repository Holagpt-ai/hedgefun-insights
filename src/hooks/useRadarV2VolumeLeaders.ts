/**
 * Pre-Market Volume Leaders Radar V2 reader (D11 / D11.2).
 *
 * Confirmed pre-market only. Reuses `loadRadarV2Decision` — the same
 * stable-generation source / adapter as /dashboard/screeners. Disabled
 * outside pre-market so RTH keeps the existing workspace path.
 *
 * Soft (background) polls must not wipe a previously verified Radar V2 board
 * because of a transient fetch / retry failure. A legitimate healthy empty
 * generation is allowed to replace prior rows.
 */

import { useCallback, useEffect, useState } from "react";
import { loadRadarV2Decision } from "@/lib/screeners/radar-v2-source";
import { radarV2ReasonFamily } from "@/lib/screeners/radar-v2-diagnostics";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";

export const RADAR_REFRESH_MS = 60_000;

/** Transient loader failures that must not destroy a verified PM board. */
export const RADAR_V2_SOFT_REFRESH_PRESERVE_REASONS = [
  "radar_v2_fetch_error",
  "radar_v2_fetch_threw",
  "radar_v2_retry_exhausted",
  "generation_race",
] as const;

export interface UseRadarV2VolumeLeadersResult {
  loading: boolean;
  decision: RadarV2Decision | null;
  retry: () => void;
}

export function isVerifiedRadarV2Decision(
  decision: RadarV2Decision | null | undefined,
): decision is RadarV2Decision {
  return !!decision && decision.source === "radar-v2" && decision.view !== null;
}

export function isTransientRadarV2SoftFailure(decision: RadarV2Decision): boolean {
  if (decision.source === "radar-v2") return false;
  const family = radarV2ReasonFamily(decision.reason);
  return (RADAR_V2_SOFT_REFRESH_PRESERVE_REASONS as readonly string[]).includes(family);
}

/**
 * Soft-refresh retain rule (mirrors useScreenerData):
 * keep the last verified Radar V2 decision when a background poll fails
 * transiently. Hard/initial loads always apply. Valid available and valid
 * empty Radar decisions always replace.
 */
export function shouldPreserveVerifiedRadarV2OnSoftRefresh(input: {
  soft: boolean;
  next: RadarV2Decision;
  prior: RadarV2Decision | null;
}): boolean {
  if (!input.soft) return false;
  if (!isVerifiedRadarV2Decision(input.prior)) return false;
  return isTransientRadarV2SoftFailure(input.next);
}

function fetchThrewDecision(): RadarV2Decision {
  return { source: "fallback", reason: "radar_v2_fetch_threw", session: null, view: null };
}

export function useRadarV2VolumeLeaders(enabled: boolean): UseRadarV2VolumeLeadersResult {
  const [loading, setLoading] = useState(enabled);
  const [decision, setDecision] = useState<RadarV2Decision | null>(null);
  const [tick, setTick] = useState(0);

  const retry = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setDecision(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async (soft: boolean) => {
      if (!soft) setLoading(true);
      let next: RadarV2Decision;
      try {
        next = await loadRadarV2Decision("day_trade_radar", Date.now());
      } catch {
        next = fetchThrewDecision();
      }
      if (cancelled) return;
      setDecision((prior) =>
        shouldPreserveVerifiedRadarV2OnSoftRefresh({ soft, next, prior }) ? prior : next,
      );
      setLoading(false);
    };

    void load(false);

    const poll = setInterval(() => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      void load(true);
    }, RADAR_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [enabled, tick]);

  return { loading, decision, retry };
}
