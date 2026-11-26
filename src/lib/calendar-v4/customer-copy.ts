export const CALENDAR_MACRO_COVERAGE = {
  loading: "Loading macro releases…",
  emptyInRange:
    "No macro releases fall in this month within the last synced provider window. This does not mean no U.S. releases exist — check official BLS, BEA, Census, and Federal Reserve schedules.",
  neverSynced:
    "Macro releases have not been synced yet in this environment. After Lovable applies the economic migrations and runs an authorized sync, scheduled releases will appear here.",
  unavailable:
    "Macro calendar storage is not active in this environment. Economic data requires the prepared migrations and Edge sync in Lovable Cloud.",
  error: "Macro releases could not be loaded. Try again shortly.",
  stale: (asOf: string) => `Macro feed last updated ${asOf}.`,
} as const;

export const CALENDAR_CATALYST_COVERAGE = {
  loading: "Loading verified catalysts…",
  empty: "No verified events match the active filters for this date.",
  error: "The catalyst feed is temporarily unavailable. Refresh to try again.",
} as const;

export const CALENDAR_AI_BRIEF = {
  cachedTitle: "Calendar intelligence",
  factualTitle: "Today's schedule",
  cachedBadge: "Cached analysis",
  factualBadge: "Verified schedule",
  noCached: "No cached AI analysis is available for these symbols yet. Event details below are from verified sources only.",
} as const;