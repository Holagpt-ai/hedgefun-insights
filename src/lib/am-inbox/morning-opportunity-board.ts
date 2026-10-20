/**
 * Morning Opportunity Board.
 *
 * A short, real-data slice for AM Inbox. It does not create rows, does not
 * change Day Trade qualification, and does not replace volume-first Radar rank.
 * Event urgency is the secondary sort documented in event-urgency.ts.
 */

import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import {
  evaluateMorningContinuationEligibility,
  evaluateMorningRadarEligibility,
  morningBoardConfirmedPremarket,
  resolveMorningOpportunityEmptyMessage,
} from "@/lib/am-inbox/morning-opportunity-eligibility";
import {
  MORNING_EMPTY_MESSAGE,
  MORNING_OPPORTUNITY_LIMIT,
  MORNING_SECTION_ORDER,
  type MorningOpportunityBoard,
  type MorningOpportunityCard,
  type MorningRadarRow,
  type MorningSectionId,
} from "@/lib/am-inbox/morning-opportunity-types";
import {
  canonicalIntelligenceEventType,
  intelligenceEventLabel,
} from "@/lib/scanner-intelligence/event-model";
import { compareEventUrgency } from "@/lib/scanner-intelligence/event-urgency";
import {
  resolveScreenerMarketDataTrust,
} from "@/lib/market-data/trust-states";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";
import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import type { SecurityId } from "@/types/security-identity";
import { resolveSessionGapPercent } from "@/lib/daily-intelligence/session-gap-evidence";
import { summarizeMorningRadarExclusions } from "@/lib/am-inbox/morning-opportunity-exclusions";
import { collectScannerEventTypes } from "@/lib/scanner-intelligence/scanner-event-handoff";

export type {
  MorningOpportunityBoard,
  MorningOpportunityCard,
  MorningOpportunitySection,
  MorningRadarRow,
  MorningSectionId,
} from "@/lib/am-inbox/morning-opportunity-types";

export {
  MORNING_EMPTY_MESSAGE,
  MORNING_OPPORTUNITY_LIMIT,
  MORNING_PREMARKET_MIN_ACCELERATION_PCT,
  MORNING_PREMARKET_MIN_RVOL_5M,
  MORNING_PREMARKET_MIN_VELOCITY,
  MORNING_SECTION_ORDER,
} from "@/lib/am-inbox/morning-opportunity-types";

export { morningBoardConfirmedPremarket } from "@/lib/am-inbox/morning-opportunity-eligibility";

type Draft = MorningOpportunityCard & {
  events: string[];
  continuationUrgency: number;
};

function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

function eventTypesOf(row: MorningRadarRow): string[] {
  return collectScannerEventTypes(row);
}

function strongestEvent(events: readonly string[]): string | null {
  const ranked = [
    "VOLUME_EXPLOSION",
    "RUNNING_UP",
    "VOLUME_ACCELERATION",
    "HOD_BREAK",
    "HOD_MOMENTUM",
    "GAP_CONTINUATION",
    "LATE_DAY_ACCELERATION",
    "VWAP_RECLAIM",
    "VWAP_LOSS",
  ];
  const present = new Set(events.map((event) => canonicalIntelligenceEventType(event)).filter(Boolean));
  for (const type of ranked) {
    if (present.has(type as never)) return type;
  }
  return null;
}

function continuationSection(entry: AmInboxLateSessionCandidate): MorningSectionId {
  const categories = entry.sourceCategories.length > 0
    ? entry.sourceCategories
    : [entry.context.sourceCategory];
  const onlyDayTwo = categories.length > 0 && categories.every((cat) => cat === "DAY_TWO_WATCH");
  return onlyDayTwo ? "day_two_watch" : "premarket_continuation";
}

function catalystStatus(
  symbol: string,
  catalystSymbols: ReadonlySet<string>,
  explicit: boolean | null,
): "present" | "pending" | "none" {
  if (explicit === true || catalystSymbols.has(symbol)) return "present";
  if (explicit === false) return "none";
  return "pending";
}

export function buildMorningOpportunityBoard(input: {
  radarRows?: readonly MorningRadarRow[] | null;
  radarSession?: string | null;
  polygonPremarketActive?: boolean;
  radarStatus?: ScreenerUiStatus | null;
  syncedAt?: string | null;
  providerAsOfMax?: string | null;
  marketFeed?: MarketFeedTelemetry | null;
  continuation?: readonly AmInboxLateSessionCandidate[] | null;
  catalystSymbols?: readonly string[] | null;
  nowMs?: number;
  generationStale?: boolean;
}): MorningOpportunityBoard {
  const nowMs = input.nowMs ?? Date.now();
  const catalystSymbols = new Set(
    (input.catalystSymbols ?? []).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
  );
  const confirmedPremarket = morningBoardConfirmedPremarket(input.polygonPremarketActive === true);

  const radarTrust = resolveScreenerMarketDataTrust({
    status: input.radarStatus ?? "unavailable",
    syncedAt: input.syncedAt,
    providerAsOfMax: input.providerAsOfMax,
    marketFeed: input.marketFeed,
    nowMs,
  });

  const drafts = new Map<string, Draft>();

  for (const row of input.radarRows ?? []) {
    const eligibility = evaluateMorningRadarEligibility(row, confirmedPremarket);
    if (!eligibility.accepted || !eligibility.section) continue;
    const symbol = eligibility.symbol;
    const events = eventTypesOf(row);
    const eventType = strongestEvent(events);
    const price = finite(row.price);
    const volume = finite(row.volume)!;
    const dollar = finite(row.rolling_dollar_volume_60s) ??
      (price !== null ? price * volume : null);
    drafts.set(symbol, {
      symbol,
      section: eligibility.section,
      eventType,
      eventLabel: intelligenceEventLabel(eventType),
      detectedAt: row.primary_scanner_event_at ?? row.provider_as_of ?? row.updated_at ?? null,
      price,
      volume,
      dollarVolume: dollar,
      rvol5m: finite(row.rvol_5m),
      gapPercent: resolveSessionGapPercent(row),
      distanceFromHodPct: finite(row.distance_from_hod_pct),
      vwapSide: row.vwap_side ?? null,
      catalystStatus: catalystStatus(symbol, catalystSymbols, null),
      trust: radarTrust,
      asOf: row.provider_as_of ?? input.syncedAt ?? null,
      continuationCategory: null,
      securityId: null,
      qualificationSummary: eligibility.reasons[0] ?? null,
      events,
      continuationUrgency: 0,
    });
  }

  let continuationQualified = 0;
  for (const entry of input.continuation ?? []) {
    const eligibility = evaluateMorningContinuationEligibility(entry);
    if (!eligibility.accepted || !eligibility.section) continue;
    continuationQualified += 1;
    const symbol = eligibility.symbol;
    const existing = drafts.get(symbol);
    const section = existing?.section ?? eligibility.section;
    const categories = entry.sourceCategories.length > 0
      ? entry.sourceCategories
      : [entry.context.sourceCategory];
    const continuationUrgency = categories.includes("POWER_HOUR_MOMENTUM")
      ? 10
      : categories.includes("STRONG_CLOSE_NEAR_HOD")
        ? 8
        : categories.includes("AFTER_HOURS_CONTINUATION")
          ? 6
          : 4;
    if (existing) {
      drafts.set(symbol, {
        ...existing,
        continuationCategory: categories[0] ?? existing.continuationCategory,
        securityId: entry.context.securityId ?? existing.securityId,
        catalystStatus: catalystStatus(symbol, catalystSymbols, entry.context.catalystPresent),
        rvol5m: existing.rvol5m ?? finite(entry.context.rvol),
        distanceFromHodPct: existing.distanceFromHodPct ?? finite(entry.context.closeDistanceFromHodPct),
        continuationUrgency,
        qualificationSummary: existing.qualificationSummary ?? eligibility.reasons[0] ?? null,
      });
      continue;
    }
    drafts.set(symbol, {
      symbol,
      section,
      eventType: null,
      eventLabel: null,
      detectedAt: entry.context.sourceTimestamp,
      price: finite(entry.context.lastPrice),
      volume: finite(entry.context.volume),
      dollarVolume: finite(entry.context.dollarVolume),
      rvol5m: finite(entry.context.rvol),
      gapPercent: null,
      distanceFromHodPct: finite(entry.context.closeDistanceFromHodPct),
      vwapSide: null,
      catalystStatus: catalystStatus(symbol, catalystSymbols, entry.context.catalystPresent),
      trust: entry.context.sourceTimestamp ? "DELAYED" : "UNAVAILABLE",
      asOf: entry.context.sourceTimestamp,
      continuationCategory: categories[0] ?? entry.context.sourceCategory,
      securityId: entry.context.securityId,
      qualificationSummary: eligibility.reasons[0] ?? null,
      events: [],
      continuationUrgency,
    });
  }

  const ranked = [...drafts.values()].sort((a, b) => compareEventUrgency(
    {
      symbol: a.symbol,
      volume: a.volume,
      events: a.events,
      catalystPresent: a.catalystStatus === "present" ? true : null,
      continuationUrgency: a.continuationUrgency,
    },
    {
      symbol: b.symbol,
      volume: b.volume,
      events: b.events,
      catalystPresent: b.catalystStatus === "present" ? true : null,
      continuationUrgency: b.continuationUrgency,
    },
  )).slice(0, MORNING_OPPORTUNITY_LIMIT);

  const sections = MORNING_SECTION_ORDER.map((section) => ({
    id: section.id,
    title: section.title,
    cards: ranked.filter((card) => card.section === section.id).map(({ events, continuationUrgency, ...card }) => card),
  })).filter((section) => section.cards.length > 0);

  const emptyMessage = sections.length === 0
    ? resolveMorningOpportunityEmptyMessage({
      radarRows: input.radarRows,
      radarStatus: input.radarStatus,
      polygonPremarketActive: input.polygonPremarketActive,
      radarTrust,
      generationStale: input.generationStale,
      continuationQualified,
    })
    : null;

  const exclusionHints =
    sections.length === 0 && (input.radarRows?.length ?? 0) > 0
      ? summarizeMorningRadarExclusions({
        radarRows: input.radarRows,
        polygonPremarketActive: input.polygonPremarketActive,
      })
      : [];

  const radarSessionLabel = input.radarSession?.trim() || null;

  return {
    sections,
    emptyMessage,
    exclusionHints,
    radarSessionLabel,
  };
}
