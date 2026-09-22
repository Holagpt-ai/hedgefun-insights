import {
  existingForwardOutcomeKeys,
  mapForwardOutcomeRow,
} from "@/lib/forward-outcomes/forward-outcome-bridge-map";
import { forwardOutcomeRowToJson } from "@/lib/forward-outcomes/forward-outcome-record";
import {
  forwardOutcomeRowKey,
  generateForwardOutcomes,
} from "@/lib/forward-outcomes/generate-forward-outcomes";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

const APPLY_CHUNK = 100;

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

export async function recomputeForwardOutcomesForSecurity(input: {
  bridge: HistoricalBridgeClient;
  securityId: SecurityId;
  computedAt?: string;
  refreshUnavailable?: boolean;
}): Promise<{ applied: number; generated: number; skippedExisting: number }> {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const [dailyRows, episodeRows, existingRows] = await Promise.all([
    input.bridge.fetchAllRows("historical_list_daily_history", { security_id: input.securityId }),
    input.bridge.fetchAllRows("historical_list_episodes", { security_id: input.securityId }),
    input.bridge.fetchAllRows("forward_outcome_list_for_security", { security_id: input.securityId }),
  ]);

  const dailyHistory = dailyRows.map(mapDaily);
  const episodes = episodeRows.map(mapEpisode);
  const existingMapped = existingRows.map(mapForwardOutcomeRow);

  let existingKeys = existingForwardOutcomeKeys(existingMapped);
  if (input.refreshUnavailable) {
    for (const row of existingMapped) {
      if (row.availabilityState === "FUTURE_SESSION_NOT_LOADED" || row.availabilityState === "EPISODE_TOO_RECENT") {
        existingKeys.delete(forwardOutcomeRowKey(row.episodeId, row.horizonKey));
      }
    }
  }

  const { rows, skippedExisting } = generateForwardOutcomes({
    securityId: input.securityId,
    dailyHistory,
    episodes,
    existingKeys,
    computedAt,
    limit: episodes.length,
  });

  let applied = 0;
  for (let i = 0; i < rows.length; i += APPLY_CHUNK) {
    const chunk = rows.slice(i, i + APPLY_CHUNK).map((row) => forwardOutcomeRowToJson(row, computedAt));
    const result = await input.bridge.call("forward_outcome_apply_batch", { rows: chunk });
    const inner = result.result;
    const count = typeof inner === "object" && inner !== null && !Array.isArray(inner)
      && typeof (inner as Record<string, unknown>).applied === "number"
      ? (inner as Record<string, unknown>).applied as number
      : chunk.length;
    applied += count;
  }

  return { applied, generated: rows.length, skippedExisting };
}
