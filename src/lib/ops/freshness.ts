/**
 * Market-session-aware freshness (Operations Control Center V1).
 *
 * Uses the existing equities session helpers (ET wall clock, weekend
 * closure). The holiday calendar table `market_session_calendar` is
 * service-role only, so browser sessions resolve schedules from the weekday
 * fallback. A weekday holiday therefore cannot be confirmed here; freshness
 * caps at "degraded" (never "failing") when the calendar is unverified and
 * the session would otherwise be live, so a market holiday is not declared
 * an outage.
 */

import { resolveSessionSchedule, type SessionKind } from "@/lib/equities-session-calendar";
import { easternParts, resolveMarketSessionAt } from "@/lib/market-session";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type { OpsStatus } from "@/lib/ops/status";

/** Polygon Stocks delayed tier (current development feed). */
export const DELAYED_FEED_ALLOWANCE_MS = 15 * 60_000;

export type ProviderDelayClass = "realtime" | "delayed" | "unknown";

export function providerDelayAllowanceMs(delay: ProviderDelayClass): number {
  // Unknown feed mode gets the delayed allowance: a deliberately delayed
  // feed must not read as an outage. The explanation says the mode is unknown.
  return delay === "realtime" ? 0 : DELAYED_FEED_ALLOWANCE_MS;
}

export function providerDelayFromFeedMode(mode: string | null | undefined): ProviderDelayClass {
  if (mode === "delayed") return "delayed";
  if (mode === "realtime" || mode === "streaming" || mode === "near_realtime") return "realtime";
  return "unknown";
}

export interface SessionContext {
  nowMs: number;
  session: SessionKind;
  /** False when the holiday/early-close calendar could not be read. */
  calendarVerified: boolean;
}

/**
 * `resolveMarketSessionAt(ms)` without a schedule uses an always-open
 * fallback (weekends included). Resolve through `resolveSessionSchedule`
 * with `exceptions = null` so Saturday/Sunday are closed while weekday
 * holidays stay unverified.
 */
export function resolveSessionContext(nowMs: number): SessionContext {
  const parts = easternParts(nowMs);
  if (!parts) return { nowMs, session: "closed", calendarVerified: false };
  const pad = (n: number) => String(n).padStart(2, "0");
  const etDate = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  const schedule = resolveSessionSchedule(etDate, null);
  return {
    nowMs,
    session: resolveMarketSessionAt(nowMs, schedule) as SessionKind,
    calendarVerified: false,
  };
}

export const SESSION_LABEL: Record<SessionKind, string> = {
  "pre-market": "Premarket",
  market: "Regular session",
  "after-hours": "After-hours",
  closed: "Closed",
};

export interface FreshnessInput {
  context: SessionContext;
  observedAtIso: string | null | undefined;
  /** Expected refresh cadence plus tolerance for this signal. */
  staleAfterMs: number;
  /** Extra allowance for a deliberately delayed provider (0 for internal signals). */
  providerDelayMs?: number;
  /** Multiplier of the window after which a live-session signal is failing. */
  failingMultiplier?: number;
}

export interface FreshnessAssessment {
  status: OpsStatus;
  ageMs: number | null;
  explanation: string;
}

export function formatAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "unknown age";
  if (ms < 0) return "in the future";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ${min % 60}m`;
  return `${Math.floor(hr / 24)}d ${hr % 24}h`;
}

export function assessFreshness(input: FreshnessInput): FreshnessAssessment {
  const { context } = input;
  const observedMs = parseTimestampMs(input.observedAtIso ?? null);
  if (observedMs === null) {
    return { status: "unknown", ageMs: null, explanation: "No observation timestamp recorded." };
  }
  const ageMs = context.nowMs - observedMs;
  if (ageMs < -5 * 60_000) {
    return {
      status: "degraded",
      ageMs,
      explanation: "Observation timestamp is in the future — clock or provider timestamp is suspect.",
    };
  }

  if (context.session === "closed") {
    return {
      status: "not_applicable",
      ageMs,
      explanation: `Market session closed; last observation ${formatAge(ageMs)} ago is retained, no refresh expected.`,
    };
  }

  const delay = input.providerDelayMs ?? 0;
  const window = input.staleAfterMs + delay;
  const failingAfter = input.staleAfterMs * (input.failingMultiplier ?? 3) + delay;
  const sessionLabel = SESSION_LABEL[context.session];

  if (ageMs <= window) {
    return {
      status: "healthy",
      ageMs,
      explanation:
        delay > 0
          ? `${formatAge(ageMs)} old during ${sessionLabel}; within refresh window plus delayed-feed allowance.`
          : `${formatAge(ageMs)} old during ${sessionLabel}; within refresh window.`,
    };
  }

  const holidayCaveat = context.calendarVerified
    ? ""
    : " Holiday calendar is not readable from this session; if today is a market holiday this is expected.";

  if (ageMs <= failingAfter || !context.calendarVerified) {
    return {
      status: "degraded",
      ageMs,
      explanation: `${formatAge(ageMs)} old during ${sessionLabel}; beyond the ${formatAge(window)} window.${holidayCaveat}`,
    };
  }

  return {
    status: "failing",
    ageMs,
    explanation: `${formatAge(ageMs)} old during ${sessionLabel}; beyond ${formatAge(failingAfter)} — data is genuinely stale.`,
  };
}
