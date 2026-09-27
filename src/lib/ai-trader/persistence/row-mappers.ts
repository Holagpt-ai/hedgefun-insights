import type { AiTraderEpisode, AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { EpisodeType } from "@/lib/ai-trader/domain/memory";
import type { AiTraderAssetClass } from "@/lib/ai-trader/domain/instrument";

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
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
    qualityScore: optionalNumber(row.quality_score),
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
    entryPrice: optionalNumber(row.entry_price),
    exitPrice: optionalNumber(row.exit_price),
    mfe: optionalNumber(row.mfe),
    mae: optionalNumber(row.mae),
    realizedPnl: optionalNumber(row.realized_pnl),
    netPnl: optionalNumber(row.net_pnl),
    featureSnapshot: jsonObject(row.feature_snapshot),
    outcome: optionalText(row.outcome),
    contextSnapshotId: optionalText(row.context_snapshot_id),
    tradeId: optionalText(row.trade_id),
    marketEpisodeId: optionalText(row.external_market_episode_id),
  };
}
