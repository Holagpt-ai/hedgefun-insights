/**
 * Screener Trigger Time V1 adapter.
 *
 * Maps authentic Radar event timestamps onto the Trigger Time engine.
 * Does not infer crossings from current volume, HOD distance, or catalyst presence.
 */

import {
  createAuthoritativeValue,
  createInvalidValue,
  createUnavailableValue,
  isUsableForDisplay,
} from "@/lib/screeners/data-quality";
import {
  emptyTriggerState,
  summarizeTriggerState,
  toCanonicalUtcTimestamp,
  updateTriggerState,
} from "@/lib/screeners/trigger-time";
import type { DataValue } from "@/types/data-quality";
import type { TriggerEvent, TriggerState, TriggerSummary } from "@/types/trigger-time";

export const TRIGGER_TIME_DISPLAY_TIMEZONE = "America/New_York";

export const TRIGGER_TYPE_LABELS = {
  DISCOVERY_TRIGGER: "Discovery",
  VOLUME_TRIGGER: "Volume",
  MOMENTUM_TRIGGER: "Momentum",
  HOD_BREAK_TRIGGER: "HOD Break",
  CATALYST_TRIGGER: "Catalyst",
} as const;

export interface ScreenerTriggerTimeSource {
  symbol: string;
  radar_trading_date?: string | null;
  promoted_at?: string | null;
  last_hod_break_at?: string | null;
}

export interface ScreenerTriggerTimeView {
  state: TriggerState;
  summary: TriggerSummary;
  primary: TriggerEvent | null;
  display: string;
}

function triggerTimestampValue(
  timestamp: string | null,
  source: string,
): DataValue<string> {
  const options = {
    metric: "triggerTime" as const,
    provenance: "INTERNAL" as const,
    source,
    freshnessState: "UNKNOWN" as const,
  };
  if (timestamp === null || timestamp === undefined || timestamp === "") {
    return createUnavailableValue(options);
  }
  const utc = toCanonicalUtcTimestamp(timestamp);
  if (utc === null) return createInvalidValue(options);
  return createAuthoritativeValue(utc, options);
}

export function formatTriggerTimePrimaryLine(iso: string | null | undefined): string {
  const utc = toCanonicalUtcTimestamp(iso);
  if (utc === null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: TRIGGER_TIME_DISPLAY_TIMEZONE,
  }).format(new Date(utc));
}

export function formatTriggerTimeSecondaryLine(iso: string | null | undefined): string {
  const utc = toCanonicalUtcTimestamp(iso);
  if (utc === null) return "";
  const date = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    timeZone: TRIGGER_TIME_DISPLAY_TIMEZONE,
  }).format(new Date(utc));
  return `${date} ET`;
}

/** Compact single-line display (mobile / legacy callers). */
export function formatTriggerTimeDisplay(iso: string | null | undefined): string {
  return formatTriggerTimePrimaryLine(iso);
}

export function selectPrimaryTrigger(state: TriggerState): TriggerEvent | null {
  const discovery = state.events
    .filter((event) => event.triggerType === "DISCOVERY_TRIGGER")
    .sort((a, b) => a.triggeredAt.localeCompare(b.triggeredAt));
  if (discovery[0]) return discovery[0];
  const ordered = [...state.events].sort((a, b) => a.triggeredAt.localeCompare(b.triggeredAt));
  return ordered[0] ?? null;
}

export function buildScreenerTriggerState(row: ScreenerTriggerTimeSource): TriggerState {
  let state = emptyTriggerState();
  const sessionDate = row.radar_trading_date?.trim() || null;
  if (!sessionDate || !row.symbol) return state;

  const discovery = triggerTimestampValue(row.promoted_at ?? null, "radar_v22_candidates.promoted_at");
  if (isUsableForDisplay(discovery) && discovery.value) {
    state = updateTriggerState(state, {
      symbol: row.symbol,
      sessionDate,
      observedAt: discovery.value,
      source: "radar_v22_candidates.promoted_at",
      discoveryQualified: "TRUE",
    }).state;
  }

  const hodBreak = triggerTimestampValue(
    row.last_hod_break_at ?? null,
    "radar_v22_candidates.last_hod_break_at",
  );
  if (isUsableForDisplay(hodBreak) && hodBreak.value) {
    state = updateTriggerState(state, {
      symbol: row.symbol,
      sessionDate,
      observedAt: hodBreak.value,
      source: "radar_v22_candidates.last_hod_break_at",
      hodBreakQualified: "TRUE",
    }).state;
  }

  return state;
}

export function evaluateScreenerTriggerTime(row: ScreenerTriggerTimeSource): ScreenerTriggerTimeView {
  const state = buildScreenerTriggerState(row);
  const primary = selectPrimaryTrigger(state);
  return {
    state,
    summary: summarizeTriggerState(state),
    primary,
    display: formatTriggerTimeDisplay(primary?.triggeredAt ?? null),
  };
}

export function formatScreenerTriggerTimeFromRow(row: ScreenerTriggerTimeSource): string {
  return evaluateScreenerTriggerTime(row).display;
}

export function inspectScreenerTriggerQuality(row: ScreenerTriggerTimeSource): {
  discovery: DataValue<string>;
  hodBreak: DataValue<string>;
} {
  return {
    discovery: triggerTimestampValue(row.promoted_at ?? null, "radar_v22_candidates.promoted_at"),
    hodBreak: triggerTimestampValue(
      row.last_hod_break_at ?? null,
      "radar_v22_candidates.last_hod_break_at",
    ),
  };
}

export function triggerTypeLabel(type: TriggerEvent["triggerType"] | undefined): string {
  if (!type) return "Triggered";
  return TRIGGER_TYPE_LABELS[type];
}
