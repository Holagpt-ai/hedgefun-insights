/**
 * Radar-backed Screeners load resolver (D13).
 *
 * Healthy Radar V2 Sentinel is the primary board. Legacy screener_results
 * may overlay confirmation metadata on Day Trade Radar symbols and may
 * render as the board only when Radar V2 is genuinely unavailable.
 */

import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { ScreenerDataSource } from "@/lib/screeners/screener-copy";
import type { ScreenerResultRow, ScreenerTabView } from "@/lib/screeners/contract";
import { attachLegacyConfirmation } from "@/lib/screeners/legacy-confirmation";
import {
  enrichDisplayFieldsForRows,
  type DisplayFieldDonor,
} from "@/lib/screeners/screener-display-enrichment";
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
  /**
   * Full-generation screener_results rows (all tabs) for display-field enrichment.
   * When omitted, falls back to legacyView.rows (tab-filtered only).
   */
  enrichmentRows?: readonly ScreenerResultRow[] | null;
  /** Optional radar_v22_board rows for honest display-field backfill. */
  boardRows?: readonly DisplayFieldDonor[] | null;
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
    nhl_baseline_status: null,
    tab_evaluation_evidence: null,
  };
}

export function resolveRadarBackedScreenerLoad(
  input: RadarBackedScreenerLoadInput,
): RadarBackedScreenerLoadResult {
  const { tabId, soft, priorRadar, radarDecision, legacyView, enrichmentRows, boardRows } =
    input;

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
    const enrichmentSource = enrichmentRows ?? legacyView?.rows ?? null;
    let rows = radarDecision.view.rows;
    if ((enrichmentSource?.length ?? 0) > 0 || (boardRows?.length ?? 0) > 0) {
      rows = enrichDisplayFieldsForRows(
        rows,
        enrichmentSource,
        boardRows ?? null,
        {
          preferredTabId: tabId,
          allowGap: false,
        },
      );
    }
    if (tabId === "day_trade_radar") {
      rows = attachLegacyConfirmation(rows, legacyView?.rows ?? null);
    }
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
