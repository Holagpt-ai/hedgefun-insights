export const LATE_SESSION_SOURCE_CATEGORIES = [
  "POWER_HOUR_MOMENTUM",
  "AFTER_HOURS_CONTINUATION",
  "STRONG_CLOSE_NEAR_HOD",
  "DAY_TWO_WATCH",
] as const;

export type LateSessionSourceCategory = (typeof LATE_SESSION_SOURCE_CATEGORIES)[number];

export function isLateSessionSourceCategory(value: string): value is LateSessionSourceCategory {
  return (LATE_SESSION_SOURCE_CATEGORIES as readonly string[]).includes(value);
}
