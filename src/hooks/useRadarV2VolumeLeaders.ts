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
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import {
  radarV2FetchThrewDecision,
  shouldPreserveVerifiedRadarV2OnSoftRefresh,
} from "@/lib/screeners/radar-v2-soft-refresh";

export const RADAR_REFRESH_MS = 60_000;

export {
  isTransientRadarV2SoftFailure,
  isVerifiedRadarV2Decision,
  RADAR_V2_SOFT_REFRESH_PRESERVE_REASONS,
  shouldPreserveVerifiedRadarV2OnSoftRefresh,
} from "@/lib/screeners/radar-v2-soft-refresh";

export interface UseRadarV2VolumeLeadersResult {
  loading: boolean;
  decision: RadarV2Decision | null;
  retry: () => void;
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
        next = radarV2FetchThrewDecision();
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
