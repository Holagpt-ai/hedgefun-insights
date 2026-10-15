import { reactionReferenceAgeMs } from "./reaction-eligibility.ts";
import { REACTION_WINDOWS, type CanonicalEvent, type ReactionWindow } from "./types.ts";

const WINDOW_MIN_AGE_MS: Partial<Record<ReactionWindow, number>> = {
  m1: 60_000,
  m5: 5 * 60_000,
  m15: 15 * 60_000,
  m30: 30 * 60_000,
  point: 0,
  session_end: 0,
  after_hours: 0,
  next_session: 0,
  multi_day: 0,
};

export const DEFAULT_LIVE_REACTION_WINDOWS: readonly ReactionWindow[] = ["m5", "m15", "m30"];

export function parseReactionWindows(value: unknown): ReactionWindow[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out: ReactionWindow[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const window = item.trim() as ReactionWindow;
    if (!(REACTION_WINDOWS as readonly string[]).includes(window)) return null;
    if (!out.includes(window)) out.push(window);
  }
  return out.length > 0 ? out : null;
}

/** Windows whose minimum observation age has elapsed since the event reference instant. */
export function reactionWindowsDueForEvent(
  event: CanonicalEvent,
  now: Date,
  windows: readonly ReactionWindow[],
): ReactionWindow[] {
  const ageMs = reactionReferenceAgeMs(event, now);
  if (ageMs == null || ageMs < 0) return [];
  return windows.filter((window) => {
    const minAge = WINDOW_MIN_AGE_MS[window];
    if (minAge == null) return false;
    return ageMs >= minAge;
  });
}
