export const CALENDAR_MACRO_COVERAGE = {
  loading: "Loading macro releases…",
  empty:
    "No macro releases are scheduled in this range. U.S. releases from the economic calendar will appear here after the next authorized sync.",
  unavailable:
    "Macro calendar data is not available in this environment. Scheduled releases are stored when the economic sync runs in production.",
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