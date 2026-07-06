// Placeholder for the future migrated watchlist analysis prompt.
// TODO: Real watchlist analysis prompt migration happens in a later sprint.
// Do not copy live prompt content here until that sprint is approved.

import type { PromptDefinition } from "./registry.ts";

export const WATCHLIST_ANALYSIS_PROMPT_ID = "watchlist.analysis" as const;

export const WATCHLIST_ANALYSIS_PROMPT_PLACEHOLDER: PromptDefinition = {
  id: WATCHLIST_ANALYSIS_PROMPT_ID,
  description:
    "Placeholder for the watchlist ticker analysis prompt. Not yet migrated.",
  defaultTier: "fast",
};
