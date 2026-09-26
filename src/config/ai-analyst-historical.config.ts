/** Deterministic caps for same-security historical evidence in AI Analyst requests. */
export const AI_ANALYST_HISTORICAL_MEMORY_BOUNDS = {
  /** Closest comparables already ranked by the historical engine (preserve order). */
  maxComparableEpisodesInPrompt: 10,
  /** Per-episode linked catalyst/event cap (matches episode linkage config). */
  maxEventsPerComparableEpisode: 3,
  /** Matches supabase/functions/chat/index.ts historical block slice. */
  maxSerializedChars: 6000,
} as const;

/** Guardrails appended server-side when historicalMemory is present. */
export const AI_ANALYST_HISTORICAL_MEMORY_GUARDRAILS = `HISTORICAL BEHAVIOR (Stocksist deterministic evidence):
- Treat historicalMemory as descriptive same-security context, not a prediction.
- Prior similar moves do not guarantee repetition.
- Always acknowledge sampleSizeQuality, sessionsObserved, and coverage dates when citing history.
- profileAvailable=false or contextLoaded=false means historical profile is unavailable — do not claim "no history ever".
- Never invent win rates, probabilities, expected moves, or confidence scores.
- Separate current verified market facts from historical analog episodes.
- When discussing analogs, cite specific prior sessionDate, movePct, rvol, and close/continuation fields when present.`;
