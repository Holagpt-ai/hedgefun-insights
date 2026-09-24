import {
  RADAR_REPEAT_MOVER_FILTER_IDS,
  RADAR_REPEAT_MOVER_PRESENTATION_SORT_KEYS,
  RADAR_REPEAT_MOVERS_VERSION,
} from "@/config/radar-repeat-movers.config";
import type { RadarRepeatMoverFilterId, RadarRepeatMoverPresentationSortKey } from "@/config/radar-repeat-movers.config";
import { mapRadarRowToRepeatMoverInput } from "@/lib/radar/map-radar-row-to-repeat-mover-input";
import { buildRepeatMoverDisplayFacts } from "@/lib/radar/radar-repeat-mover-display-facts";
import { deriveRepeatMoverProfileFreshness } from "@/lib/radar/radar-repeat-mover-freshness";
import { buildRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-mover-handoffs";
import {
  deriveHistoricalAvailabilityState,
  qualifyRadarRepeatMover,
} from "@/lib/radar/radar-repeat-mover-qualification";
import type {
  RadarRepeatMoverCandidate,
  RadarRepeatMoversView,
} from "@/lib/radar/radar-repeat-movers-types";
import { unavailableRepeatMoverProfileSnapshot } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";

export interface BuildRadarRepeatMoversViewOptions {
  nowMs?: number;
  activeFilter?: RadarRepeatMoverFilterId;
}

function readDiscoveryRank(row: RadarV2ScreenerRow, index: number): number {
  if (typeof row.radar_rank === "number" && Number.isFinite(row.radar_rank) && row.radar_rank > 0) {
    return row.radar_rank;
  }
  return index + 1;
}

function mapRowToRepeatMoverCandidate(
  row: RadarV2ScreenerRow,
  index: number,
  nowMs: number,
): RadarRepeatMoverCandidate {
  const mapped = mapRadarRowToRepeatMoverInput(row);
  const context = row.historicalContext ?? null;
  const profile = context?.profile ?? unavailableRepeatMoverProfileSnapshot();

  const evidenceLabels = context?.evidenceLabels ?? [];
  const comparableEpisodeCount = context?.comparableHistory?.comparableEpisodeCount ?? 0;
  const mostRecentComparableDate =
    context?.comparableHistory?.mostRecentComparableEpisode?.sessionDate ?? null;

  const qualification = qualifyRadarRepeatMover({ historicalContext: context });
  const profileFreshness = deriveRepeatMoverProfileFreshness({ profile, nowMs });
  const historicalAvailability = deriveHistoricalAvailabilityState({
    profileAvailable: profile.profileAvailable,
    sampleSizeQuality: profile.sampleSizeQuality,
    evidenceLabels,
  });

  return {
    discoveryRank: readDiscoveryRank(row, index),
    symbol: row.symbol,
    securityId: row.securityId ?? context?.securityId ?? null,
    currentMovePct: mapped.movePct ?? null,
    volume: mapped.volume ?? null,
    rvol: mapped.rvol ?? null,
    dollarVolume: mapped.dollarVolume ?? null,
    lifecycle: row.signal_tier ?? null,
    signalStatus: row.signal_status ?? null,
    historicalContext: context,
    evidenceLabels,
    sampleSizeQuality: profile.sampleSizeQuality,
    comparableEpisodeCount,
    mostRecentComparableDate,
    profileFreshness,
    profileCoverage: {
      historyStartDate: profile.historyStartDate,
      historyEndDate: profile.historyEndDate,
      sessionsObserved: profile.sessionsObserved,
      sourceDailyRowCount: profile.sourceDailyRowCount,
      sourceEpisodeCount: profile.sourceEpisodeCount,
    },
    historicalAvailability,
    qualification,
    displayFacts: buildRepeatMoverDisplayFacts({
      profile,
      comparableEpisodeCount,
      mostRecentComparableDate,
    }),
    workflowHandoffs: buildRepeatMoverWorkflowHandoffs(
      row.symbol,
      row.securityId ?? context?.securityId ?? null,
    ),
    profileComputedAt: profile.computedAt,
    latestSourceHistoryDate: profile.latestSourceHistoryDate,
  };
}

export function applyRadarRepeatMoverFilter(
  candidates: readonly RadarRepeatMoverCandidate[],
  filterId: RadarRepeatMoverFilterId,
): RadarRepeatMoverCandidate[] {
  if (filterId === "all") {
    return candidates.filter((c) => c.qualification.qualifies);
  }

  return candidates.filter((candidate) => {
    if (!candidate.qualification.qualifies) return false;
    switch (filterId) {
      case "recurring_movers":
        return candidate.evidenceLabels.includes("RECURRING_MOVER");
      case "similar_prior_episodes":
        return candidate.evidenceLabels.includes("SIMILAR_PRIOR_EPISODES_FOUND");
      case "adequate_or_robust_history":
        return candidate.sampleSizeQuality === "ADEQUATE" || candidate.sampleSizeQuality === "ROBUST";
      case "limited_history":
        return candidate.historicalAvailability === "LIMITED"
          || candidate.evidenceLabels.includes("LIMITED_HISTORY");
      case "fresh_profile":
        return candidate.profileFreshness === "FRESH";
      case "stale_profile":
        return candidate.profileFreshness === "STALE";
      default:
        return true;
    }
  });
}

/** Presentation-only sort; does not replace Discovery rank on the canonical view. */
export function sortRadarRepeatMoverCandidatesForPresentation(
  candidates: readonly RadarRepeatMoverCandidate[],
  sortKey: RadarRepeatMoverPresentationSortKey,
): RadarRepeatMoverCandidate[] {
  const copy = [...candidates];
  switch (sortKey) {
    case "discovery_rank":
      copy.sort((a, b) => a.discoveryRank - b.discoveryRank);
      break;
    case "comparable_episode_count":
      copy.sort((a, b) => {
        const delta = b.comparableEpisodeCount - a.comparableEpisodeCount;
        return delta !== 0 ? delta : a.discoveryRank - b.discoveryRank;
      });
      break;
    case "most_recent_comparable_date":
      copy.sort((a, b) => {
        const aDate = a.mostRecentComparableDate ?? "";
        const bDate = b.mostRecentComparableDate ?? "";
        if (aDate !== bDate) return bDate.localeCompare(aDate);
        return a.discoveryRank - b.discoveryRank;
      });
      break;
    default:
      break;
  }
  return copy;
}

/**
 * Builds Repeat Movers product state from enriched Radar rows.
 * Input order must remain Discovery rank order.
 */
export function buildRadarRepeatMoversView(
  radarRows: readonly RadarV2ScreenerRow[],
  options: BuildRadarRepeatMoversViewOptions = {},
): RadarRepeatMoversView {
  const nowMs = options.nowMs ?? Date.now();
  const candidates = radarRows.map((row, index) => mapRowToRepeatMoverCandidate(row, index, nowMs));
  const repeatMovers = candidates.filter((c) => c.qualification.qualifies);

  const filteredRepeatMovers = options.activeFilter
    ? applyRadarRepeatMoverFilter(candidates, options.activeFilter)
    : repeatMovers;

  const unavailableHistoryCount = candidates.filter((c) => c.historicalAvailability === "UNAVAILABLE").length;
  const limitedHistoryCount = candidates.filter((c) => c.historicalAvailability === "LIMITED").length;
  const freshProfileCount = candidates.filter((c) => c.profileFreshness === "FRESH").length;
  const staleProfileCount = candidates.filter((c) => c.profileFreshness === "STALE").length;

  return {
    version: RADAR_REPEAT_MOVERS_VERSION,
    generatedAt: new Date(nowMs).toISOString(),
    filtersAvailable: RADAR_REPEAT_MOVER_FILTER_IDS,
    presentationSortKeysAvailable: RADAR_REPEAT_MOVER_PRESENTATION_SORT_KEYS,
    summary: {
      totalRadarRows: radarRows.length,
      repeatMoverCount: repeatMovers.length,
      unavailableHistoryCount,
      limitedHistoryCount,
      freshProfileCount,
      staleProfileCount,
    },
    repeatMovers: filteredRepeatMovers,
    candidates,
  };
}

/** Fingerprint for tests: Discovery order and ranks unchanged by Repeat Movers view. */
export function radarRepeatMoversRankFingerprint(
  radarRows: readonly Pick<RadarV2ScreenerRow, "symbol" | "volume" | "radar_rank">[],
): string {
  return radarRows
    .map((row, index) => `${row.symbol}:${row.volume ?? "null"}:${readDiscoveryRank(row as RadarV2ScreenerRow, index)}`)
    .join("|");
}
