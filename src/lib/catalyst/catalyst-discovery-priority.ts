// Catalyst feed discovery ordering (pure). Does not change fetch limits or invent verification.

import {
  catalystDisplayCategoryFromEvent,
  type CatalystDisplayCategory,
} from "@/lib/catalyst/catalyst-event-visuals";
import { classifyCatalystPrecedence } from "@/lib/catalyst/precedence";
import { classifyFreshnessV2 } from "@/lib/catalyst/intelligence-v2";
import { eventMomentMs } from "@/lib/catalyst/parsers";
import type { CatalystEvent } from "@/types/catalyst";

export const CATALYST_FEED_SORT_MODES = ["newest", "priority"] as const;
export type CatalystFeedSortMode = (typeof CATALYST_FEED_SORT_MODES)[number];

export const CATALYST_FEED_SORT_LABEL: Record<CatalystFeedSortMode, string> = {
  newest: "Newest",
  priority: "Market-moving priority",
};

const HIGH_SIGNAL_CATEGORIES = new Set<CatalystDisplayCategory>([
  "EARNINGS",
  "GUIDANCE",
  "SEC_FILING",
  "OFFERING",
  "FDA_REGULATORY",
  "M_AND_A",
  "CONTRACT_AWARD",
  "PARTNERSHIP",
  "LEGAL",
  "MANAGEMENT",
  "CORPORATE_ACTION",
]);

export function isHighSignalCatalystCategory(category: CatalystDisplayCategory): boolean {
  return HIGH_SIGNAL_CATEGORIES.has(category);
}

export function catalystFeedCategoryForDiscovery(event: CatalystEvent): CatalystDisplayCategory {
  return catalystDisplayCategoryFromEvent({
    event_type: event.event_type,
    provider: event.provider,
    title: event.title,
    description: event.description,
    facts: event.facts,
  });
}

export function isHighSignalCatalystEvent(event: CatalystEvent): boolean {
  return isHighSignalCatalystCategory(catalystFeedCategoryForDiscovery(event));
}

/** Higher score sorts earlier when mode is priority. */
export function catalystDiscoveryPriorityScore(event: CatalystEvent, nowMs: number): number {
  const category = catalystFeedCategoryForDiscovery(event);
  const precedence = classifyCatalystPrecedence({
    title: event.title,
    description: event.description ?? null,
    event_type: event.event_type,
    provider: event.provider,
    event_date: event.event_date,
    event_time: event.event_time ?? null,
    published_at: event.published_at ?? null,
    source_name: event.source_name ?? null,
    attribution_class: event.attribution_class ?? undefined,
    ticker_specific: event.ticker_specific ?? undefined,
    facts: event.facts,
  });
  const freshness = classifyFreshnessV2(event, nowMs);
  const freshnessBoost =
    freshness === "breaking" ? 400
    : freshness === "current" ? 300
    : freshness === "prior_session" ? 120
    : freshness === "historical" ? 40
    : 0;
  const providerBoost = event.provider === "sec_edgar" ? 50 : 0;
  const categoryBoost = isHighSignalCatalystCategory(category) ? 100 : 0;
  const moment = eventMomentMs(event);
  const recency = moment !== null ? Math.min(moment, nowMs) : 0;
  return precedence.classRank * 1_000_000 + freshnessBoost * 10_000 + categoryBoost * 100 + providerBoost + recency / 1_000;
}

export function compareCatalystFeedEvents(
  a: CatalystEvent,
  b: CatalystEvent,
  mode: CatalystFeedSortMode,
  nowMs: number,
): number {
  if (mode === "priority") {
    const diff = catalystDiscoveryPriorityScore(b, nowMs) - catalystDiscoveryPriorityScore(a, nowMs);
    if (diff !== 0) return diff;
  }
  const am = eventMomentMs(a);
  const bm = eventMomentMs(b);
  if (am === null && bm === null) return a.symbol.localeCompare(b.symbol);
  if (am === null) return 1;
  if (bm === null) return -1;
  const timeDiff = bm - am;
  if (timeDiff !== 0) return timeDiff;
  return a.symbol.localeCompare(b.symbol);
}
