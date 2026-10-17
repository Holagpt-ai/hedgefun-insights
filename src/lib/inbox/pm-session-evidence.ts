/**
 * PM Inbox session attribution and highlight evidence (frontend only).
 * Reuses scanner observation validation from Breakouts / Batch 14 contracts.
 */

import { PM_GATE_THRESHOLD_MINS } from "@/config/inbox.config";
import { buildRecordedBreakoutEvents } from "@/features/day-trade-radar-v2/breakout-event-evidence";
import {
  getEtParts,
  getRegularCloseMins,
  isTradingDay,
  tradingSessionDateForInstant,
} from "@/lib/market-calendar";
import { isValidScannerAlertObservationMs, parseObservationMs } from "@/lib/scanner-alerts/observation-freshness";
import type { RadarObserveSnapshot } from "@/lib/pre-market/pm-verify";
import {
  isRadarV2ActiveSession,
  type RadarV2Decision,
} from "@/lib/screeners/radar-v2-adapter";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";

export const PM_SUMMARY_EVENT_TYPES = new Set([
  "LATE_DAY_ACCELERATION",
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "VWAP_RECLAIM",
  "GAP_CONTINUATION",
  "RUNNING_UP",
]);

export type PmHighlightFreshness =
  | "late_confirmed"
  | "historical_same_session"
  | "unverified"
  | "prior_session_snapshot";

export type PmRadarHighlightsBoardState =
  | "loading"
  | "ready"
  | "empty"
  | "unavailable"
  | "preserved_snapshot";

export interface PmRadarBoardContext {
  nowMs: number;
  applicableTradingDate: string;
  consumerEtDate: string;
  isTradingDay: boolean;
  boardState: PmRadarHighlightsBoardState;
  statusMessage: string | null;
  sessionKind: string | null;
  generationId: string | null;
  /** Stale, soft-preserved, or closed-session board — not live, may still be same trading date. */
  preservedNotLive: boolean;
  /** Radar row trading date differs from the applicable exchange session date. */
  priorSessionEvidence: boolean;
}

function easternCalendarDateFromMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function etMinutesFromMs(ms: number): number | null {
  const parts = getEtParts(new Date(ms));
  return parts.minutes;
}

export function resolvePmApplicableTradingDate(nowMs: number): {
  applicableTradingDate: string;
  consumerEtDate: string;
  isTradingDay: boolean;
} {
  const et = getEtParts(new Date(nowMs));
  const applicableTradingDate = tradingSessionDateForInstant(et.date, et.minutes);
  return {
    applicableTradingDate,
    consumerEtDate: et.date,
    isTradingDay: isTradingDay(et.date, et.weekday),
  };
}

export function pmRadarBoardAllowsHighlightBuild(boardState: PmRadarHighlightsBoardState): boolean {
  return boardState === "ready" || boardState === "preserved_snapshot";
}

export function resolvePmRadarBoardContext(input: {
  decision: RadarV2Decision | null;
  observe: RadarObserveSnapshot;
  loading: boolean;
  nowMs: number;
}): PmRadarBoardContext {
  const session = resolvePmApplicableTradingDate(input.nowMs);
  const base: PmRadarBoardContext = {
    nowMs: input.nowMs,
    applicableTradingDate: session.applicableTradingDate,
    consumerEtDate: session.consumerEtDate,
    isTradingDay: session.isTradingDay,
    boardState: "loading",
    statusMessage: null,
    sessionKind: null,
    generationId: null,
    preservedNotLive: false,
    priorSessionEvidence: false,
  };

  if (input.loading && !input.decision) {
    return { ...base, boardState: "loading" };
  }

  if (input.observe.preserved) {
    const view = input.decision?.view;
    return {
      ...base,
      boardState: "preserved_snapshot",
      statusMessage:
        "Showing preserved Radar snapshot from the last verified refresh. This may not reflect the latest generation.",
      sessionKind: input.decision?.session ?? null,
      generationId: view?.rows[0]?.sync_run_id ?? null,
      preservedNotLive: true,
      priorSessionEvidence: pmBoardRowsArePriorSession(
        view?.rows[0] as { radar_trading_date?: string | null } | undefined,
        session.applicableTradingDate,
      ),
    };
  }

  const decision = input.decision;
  if (!decision || decision.source !== "radar-v2" || !decision.view) {
    return {
      ...base,
      boardState: "unavailable",
      statusMessage: decision?.reason
        ? `Radar highlights unavailable (${decision.reason.replace(/_/g, " ")}).`
        : "Radar highlights unavailable right now.",
      sessionKind: decision?.session ?? null,
    };
  }

  const view = decision.view;
  const generationId = view.rows[0]?.sync_run_id ?? null;
  const firstRow = view.rows[0] as { radar_trading_date?: string | null } | undefined;
  const rowDate = firstRow?.radar_trading_date ?? null;
  const priorSession = pmBoardRowsArePriorSession(firstRow, session.applicableTradingDate);

  if (view.closedSnapshot === true) {
    return {
      ...base,
      boardState: "preserved_snapshot",
      statusMessage:
        "Closed-session Radar snapshot for historical review — not live current-session activity.",
      sessionKind: decision.session,
      generationId,
      preservedNotLive: true,
      priorSessionEvidence: priorSession,
    };
  }

  if (view.status === "stale") {
    return {
      ...base,
      boardState: "preserved_snapshot",
      statusMessage:
        "Radar generation is stale. Preserved rows are shown for review, not as live current-session activity.",
      sessionKind: decision.session,
      generationId,
      preservedNotLive: true,
      priorSessionEvidence: priorSession,
    };
  }

  if (!session.isTradingDay) {
    if (!view.rows.length) {
      return {
        ...base,
        boardState: "empty",
        statusMessage: "No late-session scanner highlights while the US equity market is closed.",
        sessionKind: decision.session,
        generationId: null,
      };
    }
    return {
      ...base,
      boardState: "preserved_snapshot",
      statusMessage:
        "US equity session is closed today. Radar rows are preserved for historical review, not as confirmed current PM highlights.",
      sessionKind: decision.session,
      generationId,
      preservedNotLive: true,
      priorSessionEvidence: priorSession,
    };
  }

  if (!isRadarV2ActiveSession(decision.session)) {
    return {
      ...base,
      boardState: "preserved_snapshot",
      statusMessage: `Radar session "${decision.session ?? "unknown"}" is not an active trading session. Shown for review only.`,
      sessionKind: decision.session,
      generationId,
      preservedNotLive: true,
      priorSessionEvidence: priorSession,
    };
  }

  if (priorSession) {
    return {
      ...base,
      boardState: "preserved_snapshot",
      statusMessage: `Radar board is from session ${rowDate}; applicable trading date is ${session.applicableTradingDate}. Shown for review, not as live current-session activity.`,
      sessionKind: decision.session,
      generationId,
      preservedNotLive: true,
      priorSessionEvidence: true,
    };
  }

  if (!view.rows.length) {
    return {
      ...base,
      boardState: "empty",
      statusMessage: "No late-session scanner highlights on the current Radar board.",
      sessionKind: decision.session,
      generationId: null,
    };
  }

  if (view.status !== "available") {
    return {
      ...base,
      boardState: "unavailable",
      statusMessage: `Radar highlights unavailable (board status: ${view.status}).`,
      sessionKind: decision.session,
      generationId,
    };
  }

  if (!view.synced_at?.trim() || !generationId?.trim()) {
    return {
      ...base,
      boardState: "unavailable",
      statusMessage: "Radar highlights unavailable (missing verified generation evidence).",
      sessionKind: decision.session,
      generationId,
    };
  }

  return {
    ...base,
    boardState: "ready",
    sessionKind: decision.session,
    generationId,
  };
}

export function classifyPmPrimaryEventFreshness(input: {
  eventType: string;
  eventAtUtc: string | null;
  radarTradingDate: string | null;
  applicableTradingDate: string;
  nowMs: number;
}): PmHighlightFreshness | null {
  const type = input.eventType.trim();
  if (!type || !PM_SUMMARY_EVENT_TYPES.has(type)) return null;

  if (input.radarTradingDate && input.radarTradingDate !== input.applicableTradingDate) {
    return null;
  }

  if (!input.eventAtUtc?.trim()) {
    return "unverified";
  }

  const ms = parseObservationMs(input.eventAtUtc);
  if (!isValidScannerAlertObservationMs(ms, input.nowMs)) return null;

  const eventDay = easternCalendarDateFromMs(ms);
  if (eventDay && eventDay !== input.applicableTradingDate) {
    return null;
  }

  const etMins = etMinutesFromMs(ms);
  if (etMins === null) return "unverified";

  const closeMins = getRegularCloseMins(input.applicableTradingDate);
  if (etMins >= PM_GATE_THRESHOLD_MINS && etMins < closeMins) {
    return "late_confirmed";
  }
  if (etMins >= closeMins) {
    return "late_confirmed";
  }
  return "historical_same_session";
}

export function pmHighlightFreshnessLabel(freshness: PmHighlightFreshness): string {
  switch (freshness) {
    case "late_confirmed":
      return "Late-session recorded";
    case "historical_same_session":
      return "Earlier today · historical";
    case "unverified":
      return "Observation time unverified";
    case "prior_session_snapshot":
      return "Prior session snapshot";
    default:
      return "Recorded evidence";
  }
}

export function pmHighlightFreshnessLabelForContext(
  freshness: PmHighlightFreshness,
  context: Pick<PmRadarBoardContext, "boardState" | "preservedNotLive" | "priorSessionEvidence">,
): string {
  const base = pmHighlightFreshnessLabel(freshness);
  if (
    context.boardState === "preserved_snapshot" &&
    context.preservedNotLive &&
    !context.priorSessionEvidence &&
    freshness !== "prior_session_snapshot"
  ) {
    return `${base} · preserved · not live`;
  }
  return base;
}

function pmBoardRowsArePriorSession(
  firstRow: { radar_trading_date?: string | null } | undefined,
  applicableTradingDate: string,
): boolean {
  const rowDate = firstRow?.radar_trading_date ?? null;
  return Boolean(rowDate && rowDate !== applicableTradingDate);
}

export function resolvePmPrimaryEventObservation(
  row: {
    primary_scanner_event?: string | null;
    primary_scanner_event_at?: string | null;
    scanner_events?: unknown;
    last_hod_break_at?: string | null;
    radar_trading_date?: string | null;
  },
  nowMs: number,
): { type: string; atUtc: string | null } | null {
  const events = buildRecordedBreakoutEvents(
    {
      scanner_events: row.scanner_events,
      primary_scanner_event: row.primary_scanner_event,
      primary_scanner_event_at: row.primary_scanner_event_at,
      last_hod_break_at: row.last_hod_break_at,
      radar_trading_date: row.radar_trading_date,
    },
    nowMs,
  );
  const primary = events.at(-1);
  if (primary) {
    return { type: primary.type, atUtc: primary.triggeredAtUtc };
  }
  const type = row.primary_scanner_event?.trim();
  if (!type) return null;
  return {
    type,
    atUtc: row.primary_scanner_event_at?.trim() ? row.primary_scanner_event_at : null,
  };
}
