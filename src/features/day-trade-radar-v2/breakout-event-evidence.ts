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

function isMissingTriggerTimestamp(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw !== "string") return true;
  return raw.trim().length === 0;
}

export function classifyBreakoutEventFreshness(input: {
  triggeredAtUtc: string | null;
  nowMs: number;
  radarTradingDate?: string | null;
  active: boolean;
}): BreakoutEventFreshness {
  if (!input.triggeredAtUtc) return "unverified";
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
  const missingTime = isMissingTriggerTimestamp(triggeredAtRaw);
  let triggeredAtUtc: string | null = null;
  if (!missingTime) {
    triggeredAtUtc = toCanonicalUtcTimestamp(triggeredAtRaw);
    if (triggeredAtUtc === null) return null;
  }
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

export interface BreakoutLeaderCompareContext {
  maxPositiveSessionVolume: number;
}

export function buildBreakoutLeaderCompareContext(
  rows: readonly Pick<RadarRankedRow, "volume">[],
): BreakoutLeaderCompareContext {
  let maxPositiveSessionVolume = 0;
  for (const candidate of rows) {
    const vol = breakoutSessionVolume(candidate);
    if (vol !== null && vol > 0 && vol > maxPositiveSessionVolume) {
      maxPositiveSessionVolume = vol;
    }
  }
  return { maxPositiveSessionVolume };
}

/** True when positive session volume exists elsewhere and this row cannot compete on liquidity. */
export function isBreakoutVolumeDominated(
  volume: number | null,
  maxPositiveSessionVolume: number,
): boolean {
  if (maxPositiveSessionVolume <= 0) return false;
  if (volume === null || volume <= 0) return true;
  return maxPositiveSessionVolume >= BREAKOUT_VOLUME_DOMINANCE_RATIO * volume;
}

function breakoutLeaderEventPriority(row: RadarRankedRow, nowMs: number): number {
  const recent = recentActiveBreakoutEvents(row, nowMs);
  const events = recent.length ? recent : buildRecordedBreakoutEvents(row, nowMs);
  if (events.length === 0) return 99;
  return Math.min(...events.map((event) => BREAKOUT_PRIORITY.get(event.type) ?? 99));
}

function compareBreakoutLeaderWithinComparablePool(
  a: RadarRankedRow,
  b: RadarRankedRow,
  nowMs: number,
): number {
  const aPriority = breakoutLeaderEventPriority(a, nowMs);
  const bPriority = breakoutLeaderEventPriority(b, nowMs);
  if (aPriority !== bPriority) return aPriority - bPriority;

  const aVol = breakoutSessionVolume(a);
  const bVol = breakoutSessionVolume(b);
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

export function compareBreakoutLeaderVolumeFirst(
  a: RadarRankedRow,
  b: RadarRankedRow,
  nowMs: number,
  ctx: BreakoutLeaderCompareContext,
): number {
  const aVol = breakoutSessionVolume(a);
  const bVol = breakoutSessionVolume(b);
  const aDominated = isBreakoutVolumeDominated(aVol, ctx.maxPositiveSessionVolume);
  const bDominated = isBreakoutVolumeDominated(bVol, ctx.maxPositiveSessionVolume);
  if (aDominated !== bDominated) return aDominated ? 1 : -1;

  return compareBreakoutLeaderWithinComparablePool(a, b, nowMs);
}

export function formatBreakoutLeaderExplanation(
  leader: RadarRankedRow,
  nowMs = Date.now(),
  qualifiedPeers: readonly RadarRankedRow[] = [],
): string {
  const vol = breakoutSessionVolume(leader);
  const events = buildRecordedBreakoutEvents(leader, nowMs);
  const primary = events.at(-1);
  const label = primary?.label ?? "Breakout event";
  const volPart =
    vol === null || vol <= 0
      ? "volume unavailable or zero"
      : `${Math.round(vol).toLocaleString("en-US")} session shares`;
  const ctx = buildBreakoutLeaderCompareContext(qualifiedPeers.length ? qualifiedPeers : [leader]);
  const leaderDominated = isBreakoutVolumeDominated(vol, ctx.maxPositiveSessionVolume);
  const otherNonDominated = qualifiedPeers.filter(
    (peer) =>
      peer.symbol !== leader.symbol &&
      !isBreakoutVolumeDominated(breakoutSessionVolume(peer), ctx.maxPositiveSessionVolume),
  );

  if (ctx.maxPositiveSessionVolume > 0 && !leaderDominated && otherNonDominated.length > 0) {
    return `Featured among comparable-liquidity breakouts (${volPart}) by event urgency. Primary recorded event: ${label}.`;
  }
  if (ctx.maxPositiveSessionVolume > 0 && !leaderDominated) {
    return `Featured by verified session volume (${volPart}), then event urgency. Primary recorded event: ${label}.`;
  }
  return `Featured by recorded breakout evidence (${volPart}); event urgency and Radar rank applied. Primary recorded event: ${label}.`;
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
