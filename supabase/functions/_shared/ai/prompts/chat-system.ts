// Placeholder for the future migrated chat system prompt.
// TODO: Real chat SYSTEM_PROMPT migration happens in a later sprint.
// Do not copy live prompt content here until that sprint is approved.

import type { PromptDefinition } from "./registry.ts";

export const CHAT_SYSTEM_PROMPT_ID = "chat.system" as const;

export const CHAT_SYSTEM_PROMPT_PLACEHOLDER: PromptDefinition = {
  id: CHAT_SYSTEM_PROMPT_ID,
  description:
    "Placeholder for the HedgeFun AI chat system prompt. Not yet migrated.",
  defaultTier: "fast",
};
