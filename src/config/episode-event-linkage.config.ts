/**
 * Historical Corporate Event / Catalyst Linkage V1.
 * Temporal association only — no causation scoring or ranking impact.
 */

import type { CorporateEventType, EventRelationType } from "@/config/security-intelligence.config";

export const EPISODE_EVENT_LINKAGE_VERSION = "v1" as const;

/** User-facing temporal labels (non-causal). */
export const EPISODE_TEMPORAL_RELATIONSHIPS = [
  "EVENT_PRECEDES_EPISODE",
  "EVENT_SAME_SESSION",
  "EVENT_FOLLOWS_EPISODE",
  "TEMPORALLY_ASSOCIATED",
] as const;
export type EpisodeTemporalRelationship = (typeof EPISODE_TEMPORAL_RELATIONSHIPS)[number];

/** Canonical catalyst categories for historical linkage display. */
export const EPISODE_LINKAGE_EVENT_CATEGORIES = [
  "EARNINGS",
  "GUIDANCE",
  "SEC_FILING",
  "OFFERING",
  "REVERSE_SPLIT",
  "FORWARD_SPLIT",
  "FDA_REGULATORY",
  "CONTRACT_AWARD",
  "PARTNERSHIP",
  "MERGER_ACQUISITION",
  "MANAGEMENT_CHANGE",
  "ANALYST_ACTION",
  "LEGAL",
  "BANKRUPTCY",
  "CORPORATE_ACTION",
  "PRESS_RELEASE",
  "OTHER_VERIFIED_EVENT",
  "UNKNOWN",
] as const;
export type EpisodeLinkageEventCategory = (typeof EPISODE_LINKAGE_EVENT_CATEGORIES)[number];

export interface EpisodeEventLinkageConfig {
  maxEventsPerComparable: number;
  priorTradingSessionsLookback: number;
  maxFollowsSessionDays: number;
  sameSessionOverlapRequired: boolean;
}

export function episodeEventLinkageConfig(
  overrides?: Partial<EpisodeEventLinkageConfig>,
): EpisodeEventLinkageConfig {
  return {
    maxEventsPerComparable: 3,
    priorTradingSessionsLookback: 3,
    maxFollowsSessionDays: 2,
    sameSessionOverlapRequired: true,
    ...overrides,
  };
}

export function eventRelationToTemporalRelationship(
  relation: EventRelationType,
): EpisodeTemporalRelationship {
  switch (relation) {
    case "PRECEDES_EPISODE":
      return "EVENT_PRECEDES_EPISODE";
    case "SAME_WINDOW":
    case "OVERLAPS_EPISODE":
      return "EVENT_SAME_SESSION";
    case "FOLLOWS_EPISODE":
      return "EVENT_FOLLOWS_EPISODE";
    default:
      return "TEMPORALLY_ASSOCIATED";
  }
}

export function linkageCategoryToCorporateEventType(
  category: EpisodeLinkageEventCategory,
): CorporateEventType {
  switch (category) {
    case "EARNINGS":
      return "EARNINGS";
    case "GUIDANCE":
      return "GUIDANCE";
    case "SEC_FILING":
      return "SEC_FILING";
    case "OFFERING":
      return "OFFERING";
    case "REVERSE_SPLIT":
      return "REVERSE_SPLIT";
    case "FORWARD_SPLIT":
      return "SPLIT";
    case "FDA_REGULATORY":
      return "FDA_EVENT";
    case "CONTRACT_AWARD":
      return "CONTRACT";
    case "PARTNERSHIP":
      return "PARTNERSHIP";
    case "MERGER_ACQUISITION":
      return "M_AND_A";
    case "MANAGEMENT_CHANGE":
      return "MANAGEMENT_HIRE";
    case "ANALYST_ACTION":
      return "ANALYST_ACTION";
    case "LEGAL":
      return "LITIGATION";
    case "BANKRUPTCY":
      return "BANKRUPTCY";
    case "CORPORATE_ACTION":
      return "CORPORATE_ACTION";
    case "PRESS_RELEASE":
      return "PRESS_RELEASE";
    case "UNKNOWN":
      return "UNKNOWN";
    default:
      return "OTHER";
  }
}
