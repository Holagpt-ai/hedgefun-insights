/**
 * Morning Opportunity Board.
 *
 * A short, real-data slice for AM Inbox. It does not create rows, does not
 * change Day Trade qualification, and does not replace volume-first Radar rank.
 * Event urgency is the secondary sort documented in event-urgency.ts.
 */

import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import {
  MOMENTUM_EVENT_TYPES,
  SCANNER_EVENT_MIN_SESSION_VOLUME,
  canonicalIntelligenceEventType,
  intelligenceEventLabel,
} from "@/lib/scanner-intelligence/event-model";
import { compareEventUrgency } from "@/lib/scanner-intelligence/event-urgency";
import {
  resolveScreenerMarketDataTrust,
  type MarketDataTrustState,
} from "@/lib/market-data/trust-states";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";
import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import type { SecurityId } from "@/types/security-identity";

export const MORNING_OPPORTUNITY_LIMIT = 5;

/** Mirrors scanner-events.ts participation gates used only for board membership. */
export const MORNING_PREMARKET_MIN_RVOL_5M = 1.25;
export const MORNING_PREMARKET_MIN_ACCELERATION_PCT = 15;
export const MORNING_PREMARKET_MIN_VELOCITY = 25_000;

export const MORNING_SECTION_ORDER = [
  { id: "top_momentum", title: "Top Momentum" },
  { id: "premarket_continuation", title: "Premarket Continuation" },
  { id: "gap_continuation", title: "Gap Continuation" },
  { id: "day_two_watch", title: "Day-Two Watch" },
] as const;

export type MorningSectionId = (typeof MORNING_SECTION_ORDER)[number]["id"];

export const MORNING_EMPTY_MESSAGE = "No qualifying movers yet";

export type MorningRadarRow = {
  symbol: string;
  price?: number | null;
  volume?: number | null;
  gap_percent?: number | null;
  float_shares?: number | null;
  provider_as_of?: string | null;
  updated_at?: string | null;
  primary_scanner_event?: string | null;
  primary_scanner_event_at?: string | null;
  scanner_events?: unknown;
  rvol_5m?: number | null;
  time_adjusted_rvol?: number | null;
  vol_velocity?: number | null;
  volume_acceleration_pct?: number | null;
  rolling_dollar_volume_60s?: number | null;
  distance_from_hod_pct?: number | null;
  vwap_side?: string | null;
  move_60s_pct?: number | null;
  move_15s_pct?: number | null;
};

export type MorningOpportunityCard = {
  symbol: string;
  section: MorningSectionId;
  eventType: string | null;
  eventLabel: string | null;
  detectedAt: string | null;
  price: number | null;
  volume: number | null;
  dollarVolume: number | null;
  rvol5m: number | null;
  gapPercent: number | null;
  distanceFromHodPct: number | null;
  vwapSide: string | null;
  catalystStatus: "present" | "pending" | "none";
  trust: MarketDataTrustState;
  asOf: string | null;
  continuationCategory: string | null;
  securityId: SecurityId | null;
};

export type MorningOpportunitySection = {
  id: MorningSectionId;
  title: string;
  cards: MorningOpportunityCard[];
};

export type MorningOpportunityBoard = {
  sections: MorningOpportunitySection[];
  emptyMessage: typeof MORNING_EMPTY_MESSAGE | null;
};

type Draft = MorningOpportunityCard & {
  events: string[];
  continuationUrgency: number;
};

function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

function eventTypesOf(row: MorningRadarRow): string[] {
  const out: string[] = [];
  if (Array.isArray(row.scanner_events)) {
    for (const item of row.scanner_events) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (record.active === false) continue;
      if (typeof record.type === "string" && record.type.trim()) out.push(record.type);
    }
  }
  if (row.primary_scanner_event) out.push(row.primary_scanner_event);
  return out;
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

function hasMomentumEvent(events: readonly string[]): boolean {
  return events.some((event) => {
    const type = canonicalIntelligenceEventType(event);
    return type !== null && (MOMENTUM_EVENT_TYPES as readonly string[]).includes(type);
  });
}

function premarketParticipation(row: MorningRadarRow): boolean {
  const move = finite(row.move_60s_pct) ?? finite(row.move_15s_pct);
  if (move === null || !(move > 0)) return false;
  const rvol = finite(row.rvol_5m);
  const accel = finite(row.volume_acceleration_pct);
  const velocity = finite(row.vol_velocity);
  return (rvol !== null && rvol >= MORNING_PREMARKET_MIN_RVOL_5M) ||
    (accel !== null && accel >= MORNING_PREMARKET_MIN_ACCELERATION_PCT) ||
    (velocity !== null && velocity >= MORNING_PREMARKET_MIN_VELOCITY);
}

function sectionForRadar(events: readonly string[], session: string | null, row: MorningRadarRow): MorningSectionId | null {
  if (events.some((event) => canonicalIntelligenceEventType(event) === "GAP_CONTINUATION")) {
    return "gap_continuation";
  }
  if (hasMomentumEvent(events)) return "top_momentum";
  if (session === "pre-market" && premarketParticipation(row)) return "premarket_continuation";
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
  radarStatus?: ScreenerUiStatus | null;
  syncedAt?: string | null;
  providerAsOfMax?: string | null;
  marketFeed?: MarketFeedTelemetry | null;
  continuation?: readonly AmInboxLateSessionCandidate[] | null;
  catalystSymbols?: readonly string[] | null;
  nowMs?: number;
}): MorningOpportunityBoard {
  const nowMs = input.nowMs ?? Date.now();
  const catalystSymbols = new Set(
    (input.catalystSymbols ?? []).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
  );
  const radarTrust = resolveScreenerMarketDataTrust({
    status: input.radarStatus ?? "unavailable",
    syncedAt: input.syncedAt,
    providerAsOfMax: input.providerAsOfMax,
    marketFeed: input.marketFeed,
    nowMs,
  });

  const drafts = new Map<string, Draft>();

  for (const row of input.radarRows ?? []) {
    const symbol = row.symbol?.trim().toUpperCase();
    if (!symbol) continue;
    const volume = finite(row.volume);
    if (volume === null || volume < SCANNER_EVENT_MIN_SESSION_VOLUME) continue;
    const events = eventTypesOf(row);
    const section = sectionForRadar(events, input.radarSession ?? null, row);
    if (!section) continue;
    const eventType = strongestEvent(events);
    const price = finite(row.price);
    const dollar = finite(row.rolling_dollar_volume_60s) ??
      (price !== null ? price * volume : null);
    drafts.set(symbol, {
      symbol,
      section,
      eventType,
      eventLabel: intelligenceEventLabel(eventType),
      detectedAt: row.primary_scanner_event_at ?? row.provider_as_of ?? row.updated_at ?? null,
      price,
      volume,
      dollarVolume: dollar,
      rvol5m: finite(row.rvol_5m),
      gapPercent: finite(row.gap_percent),
      distanceFromHodPct: finite(row.distance_from_hod_pct),
      vwapSide: row.vwap_side ?? null,
      catalystStatus: catalystStatus(symbol, catalystSymbols, null),
      trust: radarTrust,
      asOf: row.provider_as_of ?? input.syncedAt ?? null,
      continuationCategory: null,
      securityId: null,
      events,
      continuationUrgency: 0,
    });
  }

  for (const entry of input.continuation ?? []) {
    if (entry.context.expiryState === "expired") continue;
    const symbol = entry.context.symbol.trim().toUpperCase();
    if (!symbol) continue;
    const existing = drafts.get(symbol);
    const section = existing?.section ?? continuationSection(entry);
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
    cards: ranked.filter((card) => card.section === section.id),
  })).filter((section) => section.cards.length > 0);

  return {
    sections,
    emptyMessage: sections.length === 0 ? MORNING_EMPTY_MESSAGE : null,
  };
}
