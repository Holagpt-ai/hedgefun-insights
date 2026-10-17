/**
 * Breakouts desk: normalize persisted scanner events for display, timeline, and leadership.
 * Does not detect new events or change scanner thresholds.
 */

import { DAY_TRADE_FRESHNESS_RECENT_MS } from "@/config/day-trade-freshness.config";
import { canonicalIntelligenceEventType } from "@/lib/scanner-intelligence/event-model";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";
import { toCanonicalUtcTimestamp } from "@/lib/screeners/trigger-time";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import { formatScannerEventLabel } from "@/lib/screeners/scanner-events-display";
import type { RadarRankedRow } from "./types";

export const BREAKOUT_EVENT_TYPES = [
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "RUNNING_UP",
  "VWAP_RECLAIM",
  "GAP_CONTINUATION",
] as const;

export type BreakoutEventType = (typeof BREAKOUT_EVENT_TYPES)[number];

export const BREAKOUT_PRIORITY = new Map<string, number>(
  BREAKOUT_EVENT_TYPES.map((type, index) => [type, index]),
);

export const BREAKOUT_VOLUME_DOMINANCE_RATIO = 3;

const BREAKOUT_TYPE_SET = new Set<string>(BREAKOUT_EVENT_TYPES);

export interface ScannerEventRecord {
  type: string;
  triggeredAt: string | null;
  active: boolean;
}
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export type BreakoutEventFreshness =
  | "recent"
  | "historical"
  | "unverified"
  | "invalid";

export type BreakoutEventSource =
  | "scanner_events"
  | "primary_scanner_event"
  | "last_hod_break_at";

export interface NormalizedBreakoutEvent {
  type: string;
  label: string | null;
  triggeredAtUtc: string | null;
  triggeredAtEt: string | null;
  active: boolean;
  freshness: BreakoutEventFreshness;
  canonicalKey: string;
  source: BreakoutEventSource;
}

export function breakoutEventCanonicalKey(type: string, triggeredAtUtc: string | null): string {
  return `${type}:${triggeredAtUtc ?? ""}`;
}

function easternDateFromUtc(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function classifyBreakoutEventFreshness(input: {
  triggeredAtUtc: string | null;
  nowMs: number;
  radarTradingDate?: string | null;
  active: boolean;
}): BreakoutEventFreshness {
  if (!input.triggeredAtUtc) return input.active ? "unverified" : "unverified";
  const ms = Date.parse(input.triggeredAtUtc);
  if (!Number.isFinite(ms)) return "invalid";
  if (ms > input.nowMs + MAX_FUTURE_SKEW_MS) return "invalid";
  if (input.radarTradingDate) {
    const eventDay = easternDateFromUtc(input.triggeredAtUtc);
    if (eventDay && eventDay !== input.radarTradingDate) return "historical";
  }
  const ageMs = Math.max(0, input.nowMs - ms);
  if (ageMs <= DAY_TRADE_FRESHNESS_RECENT_MS) return "recent";
  return "historical";
}

function normalizeRawEvent(
  typeRaw: string,
  triggeredAtRaw: string | null | undefined,
  active: boolean,
  source: BreakoutEventSource,
  nowMs: number,
  radarTradingDate?: string | null,
): NormalizedBreakoutEvent | null {
  const canonicalType = canonicalIntelligenceEventType(typeRaw) ?? typeRaw.trim().toUpperCase();
  if (!canonicalType || !BREAKOUT_TYPE_SET.has(canonicalType)) return null;
  const triggeredAtUtc = toCanonicalUtcTimestamp(triggeredAtRaw ?? null);
  const freshness = classifyBreakoutEventFreshness({
    triggeredAtUtc,
    nowMs,
    radarTradingDate,
    active,
  });
  if (freshness === "invalid") return null;
  return {
    type: canonicalType,
    label: formatScannerEventLabel(canonicalType),
    triggeredAtUtc,
    triggeredAtEt: formatEtClock(triggeredAtUtc),
    active,
    freshness,
    canonicalKey: breakoutEventCanonicalKey(canonicalType, triggeredAtUtc),
    source,
  };
}

export function buildRecordedBreakoutEvents(
  row: Pick<
    RadarRankedRow,
    | "scanner_events"
    | "primary_scanner_event"
    | "primary_scanner_event_at"
    | "last_hod_break_at"
    | "radar_trading_date"
  >,
  nowMs = Date.now(),
): NormalizedBreakoutEvent[] {
  const radarTradingDate = row.radar_trading_date ?? null;
  const byKey = new Map<string, NormalizedBreakoutEvent>();

  const push = (event: NormalizedBreakoutEvent | null) => {
    if (!event) return;
    const existing = byKey.get(event.canonicalKey);
    if (!existing) {
      byKey.set(event.canonicalKey, event);
      return;
    }
    if (existing.freshness === "unverified" && event.freshness !== "unverified") {
      byKey.set(event.canonicalKey, event);
    }
  };

  if (Array.isArray(row.scanner_events)) {
    for (const item of row.scanner_events) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : "";
      const triggered = typeof record.triggered_at === "string" ? record.triggered_at : null;
      const active = record.active !== false;
      push(normalizeRawEvent(type, triggered, active, "scanner_events", nowMs, radarTradingDate));
    }
  }

  if (row.primary_scanner_event) {
    push(
      normalizeRawEvent(
        row.primary_scanner_event,
        row.primary_scanner_event_at ?? null,
        true,
        "primary_scanner_event",
        nowMs,
        radarTradingDate,
      ),
    );
  }

  if (row.last_hod_break_at) {
    push(
      normalizeRawEvent(
        "HOD_BREAK",
        row.last_hod_break_at,
        true,
        "last_hod_break_at",
        nowMs,
        radarTradingDate,
      ),
    );
  }

  return [...byKey.values()].sort((a, b) => {
    const at = a.triggeredAtUtc ?? "";
    const bt = b.triggeredAtUtc ?? "";
    if (at !== bt) return at.localeCompare(bt);
    return (BREAKOUT_PRIORITY.get(a.type) ?? 99) - (BREAKOUT_PRIORITY.get(b.type) ?? 99);
  });
}

export function toScannerEventRecords(events: NormalizedBreakoutEvent[]): ScannerEventRecord[] {
  return events.map((event) => ({
    type: event.type,
    triggeredAt: event.triggeredAtUtc,
    active: event.active,
  }));
}

/** Events that still qualify the Breakouts panel (recorded evidence, not current-momentum proof). */
export function recordedBreakoutEventsForQualification(
  row: Parameters<typeof buildRecordedBreakoutEvents>[0],
  nowMs = Date.now(),
): NormalizedBreakoutEvent[] {
  return buildRecordedBreakoutEvents(row, nowMs);
}

/** Active flag + recent freshness — usable for urgency, not sole proof of live momentum. */
export function recentActiveBreakoutEvents(
  row: Parameters<typeof buildRecordedBreakoutEvents>[0],
  nowMs = Date.now(),
): NormalizedBreakoutEvent[] {
  return buildRecordedBreakoutEvents(row, nowMs).filter(
    (event) => event.active && event.freshness === "recent",
  );
}

export function breakoutSessionVolume(row: Pick<RadarRankedRow, "volume">): number | null {
  return finiteMetric(row.volume);
}

export function compareBreakoutLeaderVolumeFirst(a: RadarRankedRow, b: RadarRankedRow, nowMs = Date.now()): number {
  const aVol = breakoutSessionVolume(a);
  const bVol = breakoutSessionVolume(b);

  if (aVol !== null && bVol !== null && aVol > 0 && bVol > 0) {
    const hi = Math.max(aVol, bVol);
    const lo = Math.min(aVol, bVol);
    if (lo > 0 && hi / lo >= BREAKOUT_VOLUME_DOMINANCE_RATIO) {
      return bVol - aVol;
    }
  } else if (aVol !== null && bVol === null) return -1;
  else if (aVol === null && bVol !== null) return 1;

  const aRecent = recentActiveBreakoutEvents(a, nowMs);
  const bRecent = recentActiveBreakoutEvents(b, nowMs);
  const aEvents = aRecent.length ? aRecent : buildRecordedBreakoutEvents(a, nowMs);
  const bEvents = bRecent.length ? bRecent : buildRecordedBreakoutEvents(b, nowMs);
  const aPriority = aEvents.length
    ? Math.min(...aEvents.map((event) => BREAKOUT_PRIORITY.get(event.type) ?? 99))
    : 99;
  const bPriority = bEvents.length
    ? Math.min(...bEvents.map((event) => BREAKOUT_PRIORITY.get(event.type) ?? 99))
    : 99;
  if (aPriority !== bPriority) return aPriority - bPriority;

  const volDiff = (bVol ?? -1) - (aVol ?? -1);
  if (volDiff !== 0) return volDiff;

  const velDiff = (finiteMetric(b.vol_velocity) ?? -1) - (finiteMetric(a.vol_velocity) ?? -1);
  if (velDiff !== 0) return velDiff;

  const aTime = buildRecordedBreakoutEvents(a, nowMs).at(-1)?.triggeredAtUtc ?? "";
  const bTime = buildRecordedBreakoutEvents(b, nowMs).at(-1)?.triggeredAtUtc ?? "";
  if (aTime !== bTime) return bTime.localeCompare(aTime);

  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.symbol.localeCompare(b.symbol);
}

export function formatBreakoutLeaderExplanation(
  leader: RadarRankedRow,
  nowMs = Date.now(),
): string {
  const vol = breakoutSessionVolume(leader);
  const events = buildRecordedBreakoutEvents(leader, nowMs);
  const primary = events.at(-1);
  const label = primary?.label ?? "Breakout event";
  const volPart = vol === null ? "volume unavailable" : `${Math.round(vol).toLocaleString("en-US")} session shares`;
  return `Featured by verified session volume (${volPart}), then event urgency. Primary recorded event: ${label}.`;
}

export function formatBreakoutFreshnessBadge(freshness: BreakoutEventFreshness): string {
  switch (freshness) {
    case "recent":
      return "Recent";
    case "historical":
      return "Historical";
    case "unverified":
      return "Time unverified";
    default:
      return "Unavailable";
  }
}
