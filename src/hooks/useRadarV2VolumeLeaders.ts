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

import { useCallback, useEffect, useRef, useState } from "react";
import { loadRadarV2Decision } from "@/lib/screeners/radar-v2-source";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import {
  radarV2FetchThrewDecision,
  shouldPreserveVerifiedRadarV2OnSoftRefresh,
} from "@/lib/screeners/radar-v2-soft-refresh";
import {
  EMPTY_RADAR_OBSERVE,
  generationIdFromDecision,
  type RadarObserveSnapshot,
} from "@/lib/pre-market/pm-verify";

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
  /** Observation-only soft-refresh bookkeeping. Does not change applied decisions. */
  observe: RadarObserveSnapshot;
}

export function useRadarV2VolumeLeaders(enabled: boolean): UseRadarV2VolumeLeadersResult {
  const [loading, setLoading] = useState(enabled);
  const [decision, setDecision] = useState<RadarV2Decision | null>(null);
  const [observe, setObserve] = useState<RadarObserveSnapshot>(EMPTY_RADAR_OBSERVE);
  const [tick, setTick] = useState(0);
  const decisionRef = useRef<RadarV2Decision | null>(null);
  const lastSuccessRef = useRef<string | null>(null);

  const retry = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setDecision(null);
      setObserve(EMPTY_RADAR_OBSERVE);
      decisionRef.current = null;
      lastSuccessRef.current = null;
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
      const prior = decisionRef.current;
      const preserve = shouldPreserveVerifiedRadarV2OnSoftRefresh({ soft, next, prior });
      const applied = preserve ? prior : next;
      decisionRef.current = applied;
      setDecision(applied);

      if (preserve && prior) {
        setObserve({
          lastSuccessfulRefreshAt: lastSuccessRef.current,
          preserved: true,
          preserveReason: next.reason,
          previousGenerationId: generationIdFromDecision(prior),
          preservedSyncedAt: prior.view?.synced_at ?? null,
        });
      } else {
        if (applied && applied.source === "radar-v2" && applied.view) {
          lastSuccessRef.current = new Date().toISOString();
        }
        setObserve({
          lastSuccessfulRefreshAt: lastSuccessRef.current,
          preserved: false,
          preserveReason: null,
          previousGenerationId: null,
          preservedSyncedAt: null,
        });
      }
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

  return { loading, decision, retry, observe };
}
