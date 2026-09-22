/**
 * Security Intelligence data model V1.
 *
 * Schema and validation only. Does not backfill, detect episodes, or score causation.
 */

import type {
  DataFreshnessState,
  DataProvenanceState,
  DataQualityState,
} from "@/config/data-quality.config";

export const SECURITY_INTELLIGENCE_VERSION = "v1" as const;
export type SecurityIntelligenceVersion = typeof SECURITY_INTELLIGENCE_VERSION;

export const EPISODE_DIRECTIONS = ["POSITIVE", "NEGATIVE", "MIXED"] as const;
export type EpisodeDirection = (typeof EPISODE_DIRECTIONS)[number];

export const EPISODE_TIERS = ["NOTABLE", "SIGNIFICANT", "EXTREME"] as const;
export type EpisodeTier = (typeof EPISODE_TIERS)[number];

export const EPISODE_ORIGINS = ["HISTORICAL_BACKFILL", "STOCKSIST_LIVE"] as const;
export type EpisodeOrigin = (typeof EPISODE_ORIGINS)[number];

export const CORPORATE_EVENT_TYPES = [
  "EARNINGS",
  "GUIDANCE",
  "PRESS_RELEASE",
  "SEC_FILING",
  "INSIDER_BUY",
  "INSIDER_SELL",
  "OFFERING",
  "FINANCING",
  "M_AND_A",
  "ACQUISITION",
  "PARTNERSHIP",
  "CONTRACT",
  "ORDER",
  "FDA_EVENT",
  "CLINICAL_EVENT",
  "PRODUCT_EVENT",
  "PATENT",
  "AI_ANNOUNCEMENT",
  "CRYPTO_ANNOUNCEMENT",
  "MANAGEMENT_HIRE",
  "MANAGEMENT_DEPARTURE",
  "SPLIT",
  "REVERSE_SPLIT",
  "SHAREHOLDER_MEETING",
  "INVESTOR_CONFERENCE",
  "DIVIDEND",
  "BUYBACK",
  "LITIGATION",
  "REGULATORY_EVENT",
  "EXCHANGE_COMPLIANCE",
  "OWNERSHIP_CHANGE",
  "ANALYST_ACTION",
  "BANKRUPTCY",
  "CORPORATE_ACTION",
  "UNKNOWN",
  "OTHER",
] as const;
export type CorporateEventType = (typeof CORPORATE_EVENT_TYPES)[number];

/** Neutral evidence links. None of these assert that the event caused the episode. */
export const EVENT_RELATION_TYPES = [
  "SAME_WINDOW",
  "PRECEDES_EPISODE",
  "OVERLAPS_EPISODE",
  "FOLLOWS_EPISODE",
  "UNKNOWN_RELATIONSHIP",
] as const;
export type EventRelationType = (typeof EVENT_RELATION_TYPES)[number];

export const FORWARD_OUTCOME_HORIZONS = [
  "5M",
  "15M",
  "30M",
  "1H",
  "CLOSE",
  "AFTER_HOURS",
  "NEXT_OPEN",
  "D1",
  "D2",
  "D3",
  "D5",
  "D10",
  "D30",
] as const;
export type ForwardOutcomeHorizon = (typeof FORWARD_OUTCOME_HORIZONS)[number];

export const EPISODE_EVENT_TYPES = [
  "DISCOVERED",
  "VOLUME_TRIGGER",
  "MOMENTUM_TRIGGER",
  "NEW_HOD",
  "NEW_LOD",
  "HALT",
  "RESUME",
  "PULLBACK",
  "VWAP_LOSS",
  "VWAP_RECLAIM",
  "RANGE_EXPANSION",
] as const;
export type EpisodeEventType = (typeof EPISODE_EVENT_TYPES)[number];

export const BACKFILL_JOB_STATES = ["PENDING", "RUNNING", "PAUSED", "FAILED", "COMPLETE"] as const;
export type BackfillJobState = (typeof BACKFILL_JOB_STATES)[number];

export const BACKFILL_JOB_TRANSITIONS: Record<BackfillJobState, readonly BackfillJobState[]> = {
  PENDING: ["RUNNING"],
  RUNNING: ["PAUSED", "FAILED", "COMPLETE"],
  PAUSED: ["RUNNING", "FAILED"],
  FAILED: ["PENDING", "RUNNING"],
  COMPLETE: [],
};

export const INTELLIGENCE_QUALITY_STATES = [
  "AUTHORITATIVE",
  "DERIVED",
  "PARTIAL",
  "DISCREPANCY",
  "UNAVAILABLE",
  "INVALID",
] as const satisfies readonly DataQualityState[];

export const INTELLIGENCE_FRESHNESS_STATES = [
  "FRESH",
  "AGING",
  "STALE",
  "UNKNOWN",
] as const satisfies readonly DataFreshnessState[];

export const INTELLIGENCE_PROVENANCE_STATES = [
  "PROVIDER",
  "DERIVED",
  "INTERNAL",
  "COMPOSITE",
  "UNKNOWN",
] as const satisfies readonly DataProvenanceState[];
