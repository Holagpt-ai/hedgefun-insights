/**
 * Pre-Market Volume Leaders Radar V2 reader (D11).
 *
 * Confirmed pre-market only. Reuses `loadRadarV2Decision` — the same
 * stable-generation source / adapter as /dashboard/screeners. Disabled
 * outside pre-market so RTH keeps the existing workspace path.
 */

import { useCallback, useEffect, useState } from "react";
import { loadRadarV2Decision } from "@/lib/screeners/radar-v2-source";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";

const RADAR_REFRESH_MS = 60_000;

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
      const next = await loadRadarV2Decision("day_trade_radar", Date.now());
      if (cancelled) return;
      setDecision(next);
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
