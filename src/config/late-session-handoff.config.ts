import type { ContinuationCategory } from "@/config/continuation.config";

/** Late-session categories eligible for next-session AM Inbox handoff. */
export const LATE_SESSION_SOURCE_CATEGORIES = [
  "POWER_HOUR_MOMENTUM",
  "AFTER_HOURS_CONTINUATION",
  "STRONG_CLOSE_NEAR_HOD",
  "DAY_TWO_WATCH",
] as const satisfies readonly ContinuationCategory[];

export type LateSessionSourceCategory = (typeof LATE_SESSION_SOURCE_CATEGORIES)[number];

export const LATE_SESSION_HANDOFF_STORAGE_KEY = "stocksist-late-session-handoffs-v1";

/** Main AM Inbox continuation module — full dataset remains available via View All. */
export const AM_INBOX_LATE_SESSION_VISIBLE_LIMIT = 6;
