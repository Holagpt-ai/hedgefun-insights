/** Bounds for symbol-scoped AI Analyst intelligence (Prompt #19). */
export const AI_ANALYST_INTELLIGENCE_BOUNDS = {
  maxRadarEvents: 8,
  maxCatalystRows: 6,
  maxJournalTrades: 3,
  maxLateSessionHandoffs: 3,
  maxPromotionReasonChars: 240,
  maxWatchlistExplanationChars: 400,
  maxSerializedChars: 4500,
} as const;

/** Injected as modelInterpretationGuide — not factual data. */
export const AI_ANALYST_RESPONSE_STRUCTURE = `Respond using these sections when enough evidence exists (omit empty sections; never fabricate):
1. What is happening now? — current session evidence only
2. Why this ticker matters — tie verified catalysts, radar promotion, or watchlist drivers
3. What confirms strength — participation, RVOL, lifecycle, geometry (verified fields only)
4. What weakens the setup — missing levels, fading participation, conflicting history
5. Similar episodes historically — cite sessionDate and stored outcomes from historicalMemory
6. Levels that matter — VWAP/HOD/LOD/prior close from verifiedFacts only
7. What remains unknown — explicit unavailable fields

Confidence wording: use strong evidence / mixed evidence / limited evidence / unavailable.
Do not invent percentages unless present in stored historical outcomes.`;

export const AI_ANALYST_FACT_SECTIONS = [
  "VERIFIED_FACTS",
  "HISTORICAL_EVIDENCE",
  "CURRENT_SESSION_EVIDENCE",
  "MODEL_INTERPRETATION",
] as const;
