// Placeholder for the future migrated AM/PM daily brief prompts.
// TODO: Real brief prompt migration happens in a later sprint.
// Do not copy live prompt content here until that sprint is approved.

import type { PromptDefinition } from "./registry.ts";

export const AM_BRIEF_PROMPT_ID = "brief.am" as const;
export const PM_BRIEF_PROMPT_ID = "brief.pm" as const;

export const AM_BRIEF_PROMPT_PLACEHOLDER: PromptDefinition = {
  id: AM_BRIEF_PROMPT_ID,
  description: "Placeholder for the AM pre-market brief prompt. Not yet migrated.",
  defaultTier: "standard",
};

export const PM_BRIEF_PROMPT_PLACEHOLDER: PromptDefinition = {
  id: PM_BRIEF_PROMPT_ID,
  description: "Placeholder for the PM market recap prompt. Not yet migrated.",
  defaultTier: "standard",
};
