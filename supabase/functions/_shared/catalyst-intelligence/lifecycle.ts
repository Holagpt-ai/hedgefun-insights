import type { NormalizedTiming } from "./timing.ts";
import type { LifecycleLogEntry, LifecycleState } from "./types.ts";

const LEGAL: Record<LifecycleState, readonly LifecycleState[]> = {
  discovered: ["scheduled", "approaching", "live", "announced", "invalidated"],
  scheduled: ["approaching", "live", "announced", "invalidated"],
  approaching: ["live", "announced", "invalidated"],
  live: ["announced", "reacting", "invalidated"],
  announced: ["reacting", "follow_through", "resolved", "invalidated"],
  reacting: ["follow_through", "resolved", "invalidated"],
  follow_through: ["resolved", "invalidated"],
  resolved: [],
  invalidated: [],
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  if (from === to) return true;
  return LEGAL[from].includes(to);
}

/** Returns the next state. Illegal targets are refused and the current state is kept. */
export function transitionLifecycle(from: LifecycleState, to: LifecycleState): LifecycleState {
  if (!canTransition(from, to)) return from;
  return to;
}

export function appendLifecycle(
  log: LifecycleLogEntry[],
  from: LifecycleState,
  to: LifecycleState,
  at: string,
  reason: string,
): LifecycleLogEntry[] {
  if (from === to) return log;
  return [...log, { from, to, at, reason }];
}

export function applyScheduleClock(
  current: LifecycleState,
  timing: Pick<NormalizedTiming, "scheduledStart" | "scheduledEnd" | "scheduledDate">,
  now: Date,
): { lifecycle: LifecycleState; reason: string | null } {
  let next = current;
  let reason: string | null = null;
  const startMs = timing.scheduledStart ? Date.parse(timing.scheduledStart) : NaN;
  const endMs = timing.scheduledEnd ? Date.parse(timing.scheduledEnd) : NaN;
  const hasStart = Number.isFinite(startMs);
  if (hasStart && startMs > now.getTime()) {
    const stepped = transitionLifecycle(next, "scheduled");
    if (stepped !== next) reason = "future_schedule";
    next = stepped;
    if (startMs - now.getTime() <= 24 * 60 * 60 * 1000) {
      const approaching = transitionLifecycle(next, "approaching");
      if (approaching !== next) reason = "within_24h";
      next = approaching;
    }
    return { lifecycle: next, reason };
  }
  if (!hasStart && timing.scheduledDate && timing.scheduledDate >= now.toISOString().slice(0, 10)) {
    const stepped = transitionLifecycle(next, "scheduled");
    if (stepped !== next) reason = "future_date";
    return { lifecycle: stepped, reason: stepped === next ? reason : "future_date" };
  }
  if (hasStart && startMs <= now.getTime()) {
    const end = Number.isFinite(endMs) ? endMs : startMs + 2 * 60 * 60 * 1000;
    if (now.getTime() <= end) {
      const live = transitionLifecycle(next, "live");
      if (live !== next) reason = "schedule_window";
      next = live;
    }
  }
  return { lifecycle: next, reason };
}

export function advanceForAnnouncement(current: LifecycleState): LifecycleState {
  return transitionLifecycle(current, "announced");
}

export function advanceForReaction(current: LifecycleState, window: string): LifecycleState {
  if (current !== "announced" && current !== "live" && current !== "reacting" && current !== "follow_through") {
    return current;
  }
  if (window === "next_session" || window === "multi_day") {
    const followed = transitionLifecycle(current, "follow_through");
    return followed;
  }
  return transitionLifecycle(current, "reacting");
}
