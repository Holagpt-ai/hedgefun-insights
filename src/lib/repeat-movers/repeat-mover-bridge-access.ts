import { BridgeBehaviorProfileRepository } from "@/lib/behavior-profile/behavior-profile-repository";
import { eventReactionLinkWithEventFromBridgeRow } from "@/lib/episode-event-linkage/episode-event-linkage-bridge-map";
import { mapForwardOutcomeRow } from "@/lib/forward-outcomes/forward-outcome-bridge-map";
import { getRepeatMoverContext } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { RepeatMoverDataAccess } from "@/lib/repeat-movers/get-repeat-mover-context";
import { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import type { RepeatMoverContextInput } from "@/lib/repeat-movers/normalize-repeat-mover-context";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

function mapDaily(row: Record<string, unknown>): SecurityDailyHistory {
  return {
    securityId: String(row.security_id),
    sessionDate: String(row.session_date).slice(0, 10),
    observedSymbol: typeof row.observed_symbol === "string" ? row.observed_symbol : null,
    exchange: typeof row.exchange === "string" ? row.exchange : null,
    open: row.open === null ? null : Number(row.open),
    high: row.high === null ? null : Number(row.high),
    low: row.low === null ? null : Number(row.low),
    close: row.close === null ? null : Number(row.close),
    volume: row.volume === null ? null : Number(row.volume),
    dollarVolume: row.dollar_volume === null ? null : Number(row.dollar_volume),
    previousClose: row.previous_close === null ? null : Number(row.previous_close),
    movePct: row.move_pct === null ? null : Number(row.move_pct),
    source: typeof row.source === "string" ? row.source : null,
    sourceAsOf: typeof row.source_as_of === "string" ? row.source_as_of : null,
    fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
    computedAt: typeof row.computed_at === "string" ? row.computed_at : null,
    quality: row.quality as SecurityDailyHistory["quality"],
    freshness: row.freshness as SecurityDailyHistory["freshness"],
    provenance: row.provenance as SecurityDailyHistory["provenance"],
  };
}

function mapEpisode(row: Record<string, unknown>): MarketBehaviorEpisode {
  return {
    episodeId: String(row.episode_id),
    securityId: String(row.security_id),
    episodeStart: String(row.episode_start),
    episodeEnd: typeof row.episode_end === "string" ? row.episode_end : null,
    observedSymbol: typeof row.observed_symbol === "string" ? row.observed_symbol : null,
    direction: row.direction as MarketBehaviorEpisode["direction"],
    tier: row.tier as MarketBehaviorEpisode["tier"],
    startPrice: row.start_price === null ? null : Number(row.start_price),
    highPrice: row.high_price === null ? null : Number(row.high_price),
    lowPrice: row.low_price === null ? null : Number(row.low_price),
    endPrice: row.end_price === null ? null : Number(row.end_price),
    maxPositiveMovePct: row.max_positive_move_pct === null ? null : Number(row.max_positive_move_pct),
    maxNegativeMovePct: row.max_negative_move_pct === null ? null : Number(row.max_negative_move_pct),
    volume: row.volume === null ? null : Number(row.volume),
    dollarVolume: row.dollar_volume === null ? null : Number(row.dollar_volume),
    rvol: row.rvol === null ? null : Number(row.rvol),
    floatTurnover: row.float_turnover === null ? null : Number(row.float_turnover),
    haltCount: row.halt_count === null ? null : Number(row.halt_count),
    closeStrength: row.close_strength === null ? null : Number(row.close_strength),
    detectedBy: typeof row.detected_by === "string" ? row.detected_by : null,
    origin: row.origin as MarketBehaviorEpisode["origin"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    source: typeof row.source === "string" ? row.source : null,
    sourceAsOf: typeof row.source_as_of === "string" ? row.source_as_of : null,
    fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
    computedAt: typeof row.computed_at === "string" ? row.computed_at : null,
    quality: row.quality as MarketBehaviorEpisode["quality"],
    freshness: row.freshness as MarketBehaviorEpisode["freshness"],
    provenance: row.provenance as MarketBehaviorEpisode["provenance"],
  };
}

export function createRepeatMoverBridgeDataAccess(
  bridge: HistoricalBridgeClient,
): RepeatMoverDataAccess {
  const profiles = new BridgeBehaviorProfileRepository(bridge);
  return {
    getBehaviorProfile: (securityId) => profiles.getSecurityBehaviorProfile(securityId),
    async listDailyHistory(securityId: SecurityId) {
      const rows = await bridge.fetchAllRows("historical_list_daily_history", { security_id: securityId });
      return rows.map(mapDaily);
    },
    async listEpisodes(securityId: SecurityId) {
      const rows = await bridge.fetchAllRows("historical_list_episodes", { security_id: securityId });
      return rows.map(mapEpisode);
    },
    async listForwardOutcomesForEpisodes(episodeIds) {
      if (episodeIds.length === 0) return [];
      const result = await bridge.call("forward_outcome_list_by_episodes", {
        episode_ids: [...episodeIds],
      });
      const raw = Array.isArray(result.result)
        ? result.result
        : Array.isArray(result.rows)
          ? result.rows
          : [];
      return (raw as Record<string, unknown>[]).map(mapForwardOutcomeRow);
    },
    async listEventReactionLinksForEpisodes(episodeIds) {
      if (episodeIds.length === 0) return [];
      const result = await bridge.call("event_reaction_link_list_for_episodes", {
        episode_ids: [...episodeIds],
      });
      const raw = Array.isArray(result.result) ? result.result : [];
      return (raw as Record<string, unknown>[]).map(eventReactionLinkWithEventFromBridgeRow);
    },
  };
}

export async function getRepeatMoverContextViaBridge(input: {
  bridge: HistoricalBridgeClient;
  securityId: SecurityId;
  currentContext: RepeatMoverContextInput;
  assembledAt?: string;
}) {
  return getRepeatMoverContext({
    securityId: input.securityId,
    currentContext: input.currentContext,
    data: createRepeatMoverBridgeDataAccess(input.bridge),
    assembledAt: input.assembledAt,
  });
}
