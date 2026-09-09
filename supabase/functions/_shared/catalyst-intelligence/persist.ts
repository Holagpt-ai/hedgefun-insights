// Persistence row shapes for catalyst_intelligence and alert_events.
// V1 writes to an internal in-memory queue only. These mappers exist so a
// later service-role writer can persist without changing the contract.
// This module does not open a database connection.

import type { AlertEvent, CatalystIntelligenceRecord } from "./types.ts";

export interface CatalystIntelligenceRow {
  source_event_id: string | null;
  source_dedupe_key: string;
  symbol: string;
  classification: string;
  direction: string;
  fact_state: string;
  source_quality_score: number;
  ticker_specificity_score: number;
  materiality_score: number;
  freshness_score: number;
  confidence_score: number;
  catalyst_score: number;
  provider: string;
  event_type: string;
  title: string;
  source_name: string;
  source_url: string | null;
  evidence: Record<string, unknown>;
  scoring_version: string;
  rules_version: string;
  lifecycle: string;
  evidence_as_of: string | null;
  market_context_as_of: string | null;
}

export interface AlertEventRow {
  dedupe_key: string;
  intelligence_source_dedupe_key: string;
  symbol: string;
  classification: string;
  direction: string;
  catalyst_score: number;
  title: string;
  source_url: string | null;
  source_name: string;
  provider: string;
  fact_state: string;
  payload: Record<string, unknown>;
  delivery_status: string;
  delivery_suppressed_reason: string | null;
}

export function toIntelligenceRow(record: CatalystIntelligenceRecord): CatalystIntelligenceRow {
  return {
    source_event_id: record.source_event_id,
    source_dedupe_key: record.source_dedupe_key,
    symbol: record.symbol,
    classification: record.classification,
    direction: record.direction,
    fact_state: record.fact_state,
    source_quality_score: record.scores.source_quality,
    ticker_specificity_score: record.scores.ticker_specificity,
    materiality_score: record.scores.materiality,
    freshness_score: record.scores.freshness,
    confidence_score: record.scores.confidence,
    catalyst_score: record.scores.catalyst_score,
    provider: record.provider,
    event_type: record.event_type,
    title: record.title,
    source_name: record.source_name,
    source_url: record.source_url,
    evidence: record.evidence as unknown as Record<string, unknown>,
    scoring_version: record.scoring_version,
    rules_version: record.rules_version,
    lifecycle: record.lifecycle,
    evidence_as_of: record.evidence_as_of,
    market_context_as_of: record.market_context_as_of,
  };
}

export function toAlertEventRow(event: AlertEvent): AlertEventRow {
  return {
    dedupe_key: event.dedupeKey,
    intelligence_source_dedupe_key: event.sourceEventDedupeKey,
    symbol: event.symbol,
    classification: event.classification,
    direction: event.direction,
    catalyst_score: event.catalystScore,
    title: event.title,
    source_url: event.sourceUrl,
    source_name: event.sourceName,
    provider: event.provider,
    fact_state: event.factState,
    payload: {
      intelligence_id: event.intelligenceId,
      evidence: event.evidence,
    },
    delivery_status: event.deliveryStatus,
    delivery_suppressed_reason: event.deliverySuppressedReason,
  };
}
