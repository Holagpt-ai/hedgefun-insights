import type { AiTraderEpisode, AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { EpisodeType } from "@/lib/ai-trader/domain/memory";
import type { AiTraderAssetClass } from "@/lib/ai-trader/domain/instrument";

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * Supabase serializes Postgres numeric as string.
 * NULL stays NULL. Non-finite and non-numeric values reject.
 * Decimals are not coerced to integers.
 * Real-money accounting may later need a decimal library; this mapper is JavaScript number only.
 */
const NUMERIC_STRING = /^-?(?:\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export function parseNullableNumeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("non-finite numeric value");
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (!NUMERIC_STRING.test(trimmed)) {
      throw new TypeError(`invalid numeric string: ${value}`);
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new TypeError("non-finite numeric string");
    }
    return parsed;
  }
  throw new TypeError("numeric value must be a number, numeric string, or null");
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export function mapObservationRow(row: Record<string, unknown>): AiTraderObservation {
  return {
    kind: "OBSERVATION",
    id: text(row.id),
    instrument: {
      symbol: text(row.symbol),
      assetClass: (optionalText(row.asset_class) ?? "US_EQUITY") as AiTraderAssetClass,
      venue: null,
    },
    observedAt: text(row.observed_at),
    observationType: text(row.observation_type),
    value: jsonObject(row.value_json),
    provenance: {
      source: text(row.source),
      sourceType: optionalText(row.source_type) ?? "unknown",
      sourceId: optionalText(row.source_id) ?? text(row.id),
      sourceTimestamp: optionalText(row.source_timestamp),
      retrievedAt: optionalText(row.retrieved_at),
      verificationState: text(row.verification_state),
    },
    qualityScore: parseNullableNumeric(row.quality_score),
  };
}

export function mapEpisodeRow(row: Record<string, unknown>): AiTraderEpisode {
  return {
    id: text(row.id),
    instrument: {
      symbol: text(row.symbol),
      assetClass: (optionalText(row.asset_class) ?? "US_EQUITY") as AiTraderAssetClass,
      venue: null,
    },
    sessionDate: text(row.session_date),
    episodeType: text(row.episode_type) as EpisodeType,
    setupType: optionalText(row.setup_type),
    strategyVersion: optionalText(row.strategy_version_id),
    marketRegime: optionalText(row.market_regime),
    startedAt: text(row.started_at),
    endedAt: optionalText(row.ended_at),
    entryPrice: parseNullableNumeric(row.entry_price),
    exitPrice: parseNullableNumeric(row.exit_price),
    mfe: parseNullableNumeric(row.mfe),
    mae: parseNullableNumeric(row.mae),
    realizedPnl: parseNullableNumeric(row.realized_pnl),
    netPnl: parseNullableNumeric(row.net_pnl),
    featureSnapshot: jsonObject(row.feature_snapshot),
    outcome: optionalText(row.outcome),
    contextSnapshotId: optionalText(row.context_snapshot_id),
    tradeId: optionalText(row.trade_id),
    marketEpisodeId: optionalText(row.external_market_episode_id),
  };
}
