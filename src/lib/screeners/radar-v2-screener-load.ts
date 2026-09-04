/**
 * Radar-backed Screeners load resolver (D13).
 *
 * Healthy Radar V2 Sentinel is the primary board. Legacy screener_results
 * may overlay confirmation metadata on Day Trade Radar symbols and may
 * render as the board only when Radar V2 is genuinely unavailable.
 */

import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { ScreenerDataSource } from "@/lib/screeners/screener-copy";
import type { ScreenerTabView } from "@/lib/screeners/contract";
import { overlayLegacyConfirmation } from "@/lib/screeners/legacy-confirmation";
import {
  isVerifiedRadarV2Decision,
  shouldPreserveVerifiedRadarV2OnSoftRefresh,
} from "@/lib/screeners/radar-v2-soft-refresh";

export interface RadarBackedScreenerLoadInput {
  tabId: string;
  soft: boolean;
  priorRadar: RadarV2Decision | null;
  radarDecision: RadarV2Decision;
  /** Validated screener_results view; used for overlay and genuine fallback. */
  legacyView: ScreenerTabView | null;
}

export interface RadarBackedScreenerLoadResult {
  /** When true the hook must not mutate rows/source/session. */
  preserve: boolean;
  source: ScreenerDataSource;
  session: string | null;
  view: ScreenerTabView | null;
  nextPriorRadar: RadarV2Decision | null;
}

function asTabView(
  radar: RadarV2Decision & { view: NonNullable<RadarV2Decision["view"]> },
  rows: ScreenerTabView["rows"],
): ScreenerTabView {
  return {
    status: radar.view.status,
    rows,
    synced_at: radar.view.synced_at,
    provider_as_of_max: radar.view.provider_as_of_max,
    attempts: 1,
  };
}

export function resolveRadarBackedScreenerLoad(
  input: RadarBackedScreenerLoadInput,
): RadarBackedScreenerLoadResult {
  const { tabId, soft, priorRadar, radarDecision, legacyView } = input;

  if (shouldPreserveVerifiedRadarV2OnSoftRefresh({ soft, next: radarDecision, prior: priorRadar })) {
    return {
      preserve: true,
      source: "radar-v2",
      session: priorRadar!.session,
      view: null,
      nextPriorRadar: priorRadar,
    };
  }

  if (isVerifiedRadarV2Decision(radarDecision)) {
    const rows =
      tabId === "day_trade_radar"
        ? overlayLegacyConfirmation(radarDecision.view.rows, legacyView?.rows ?? null)
        : radarDecision.view.rows;
    return {
      preserve: false,
      source: "radar-v2",
      session: radarDecision.session,
      view: asTabView(radarDecision, rows),
      nextPriorRadar: radarDecision,
    };
  }

  return {
    preserve: false,
    source: "screener-results",
    session: null,
    view: legacyView,
    nextPriorRadar: null,
  };
}
