/**
 * Pre-Market Volume Leaders ← Radar V2 (D11).
 *
 * Reuses the same validated Radar V2 source/adapter as /dashboard/screeners.
 * Does NOT build a second Radar adapter, does not change ranking, and does
 * not invent RVOL / prior-close / gap / company-name / catalyst fields.
 *
 * During confirmed pre-market the AM Volume Leaders surface reads the accepted
 * Radar V2 generation (volume-first). Outside pre-market the existing
 * screener_results workspace section is preserved.
 */

import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { PreMarketVolumeLeader, SectionEnvelope } from "@/types/pre-market";

/** Matches the backend AM volume-leader cap in get-pre-market-workspace. */
export const RADAR_V2_VOLUME_LEADER_LIMIT = 6;

export const RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE =
  "Radar V2 Sentinel · pre-market · 15-minute delayed · sorted by volume";

export const LEGACY_VOLUME_LEADERS_SUBTITLE =
  "Screener results · 15-minute delayed · not session-attributed";

export const RADAR_V2_PM_VOLUME_LEADERS_EMPTY =
  "No qualifying pre-market Radar candidates yet.";

export const LEGACY_VOLUME_LEADERS_EMPTY = "No qualifying screener rows.";

export const RADAR_V2_VOLUME_LEADERS_UNAVAILABLE_REASON = "RADAR_V2_UNAVAILABLE";

function isPositiveVolume(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Map already-ranked Radar V2 screener rows onto the Volume Leaders row shape.
 * Adapter order (volume-first) is preserved. Honesty: RVOL, prior-close %,
 * gap, and company name stay null unless the source already had a real value —
 * Radar V2 never persists those, so they stay `—`.
 */
export function mapRadarV2RowsToVolumeLeaders(
  rows: readonly ScreenerResultRow[],
  limit: number = RADAR_V2_VOLUME_LEADER_LIMIT,
): PreMarketVolumeLeader[] {
  const out: PreMarketVolumeLeader[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    if (!isPositiveVolume(row.volume)) continue;
    out.push({
      symbol: row.symbol,
      company_name: null,
      price: row.price,
      change_percent: null,
      volume: row.volume,
      rvol: null,
      updated_at: row.updated_at ?? null,
    });
  }
  return out;
}

export function volumeLeadersFromRadarDecision(
  decision: RadarV2Decision,
  limit: number = RADAR_V2_VOLUME_LEADER_LIMIT,
): SectionEnvelope<PreMarketVolumeLeader[]> {
  if (decision.source !== "radar-v2" || !decision.view) {
    return {
      status: "unavailable",
      data: [],
      as_of: null,
      reason_code: RADAR_V2_VOLUME_LEADERS_UNAVAILABLE_REASON,
    };
  }

  if (decision.view.status === "empty" || decision.reason === "radar_v2_empty") {
    return {
      status: "empty",
      data: [],
      as_of: decision.view.synced_at,
      reason_code: "NO_QUALIFYING_DATA",
    };
  }

  const data = mapRadarV2RowsToVolumeLeaders(decision.view.rows, limit);
  if (data.length === 0) {
    return {
      status: "empty",
      data: [],
      as_of: decision.view.synced_at,
      reason_code: "NO_QUALIFYING_DATA",
    };
  }

  const status =
    decision.view.status === "stale"
      ? "stale"
      : decision.view.status === "available"
        ? "available"
        : "empty";

  return {
    status,
    data,
    as_of: decision.view.synced_at,
    reason_code: null,
  };
}

export interface VolumeLeadersView {
  section: SectionEnvelope<PreMarketVolumeLeader[]> | null;
  loading: boolean;
  subtitle: string;
  emptyMessage: string;
  /** Which source populated this view; null while loading. */
  source: "radar-v2" | "screener-results" | "unavailable" | null;
}

/**
 * Choose Volume Leaders presentation. Confirmed pre-market uses Radar V2;
 * every other session keeps the workspace screener_results section.
 */
export function resolveVolumeLeadersView(input: {
  premarketActive: boolean;
  workspaceLoading: boolean;
  workspaceSection: SectionEnvelope<PreMarketVolumeLeader[]> | null;
  radarLoading: boolean;
  radarDecision: RadarV2Decision | null;
}): VolumeLeadersView {
  if (!input.premarketActive) {
    return {
      section: input.workspaceSection,
      loading: input.workspaceLoading,
      subtitle: LEGACY_VOLUME_LEADERS_SUBTITLE,
      emptyMessage: LEGACY_VOLUME_LEADERS_EMPTY,
      source: input.workspaceLoading ? null : "screener-results",
    };
  }

  if (input.radarLoading || !input.radarDecision) {
    return {
      section: null,
      loading: true,
      subtitle: RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE,
      emptyMessage: RADAR_V2_PM_VOLUME_LEADERS_EMPTY,
      source: null,
    };
  }

  const section = volumeLeadersFromRadarDecision(input.radarDecision);
  if (input.radarDecision.source === "radar-v2") {
    return {
      section,
      loading: false,
      subtitle: RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE,
      emptyMessage: RADAR_V2_PM_VOLUME_LEADERS_EMPTY,
      source: "radar-v2",
    };
  }

  return {
    section,
    loading: false,
    subtitle: RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE,
    emptyMessage: RADAR_V2_PM_VOLUME_LEADERS_EMPTY,
    source: "unavailable",
  };
}
