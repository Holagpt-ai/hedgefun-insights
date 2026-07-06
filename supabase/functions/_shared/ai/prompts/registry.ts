// Prompt registry skeleton. No live prompt content is stored here yet.
// Real prompts migrate in a later sprint.

import type { AiProviderId, AiTier, PromptId } from "../types.ts";

export interface PromptDefinition {
  id: PromptId;
  description: string;
  defaultTier: AiTier;
  defaultProvider?: AiProviderId;
  // Placeholder: real templates will be introduced in a later sprint.
  system?: string;
  userTemplate?: string;
  outputSchema?: Record<string, unknown>;
}

// Intentionally empty. Placeholder prompt files export their own definitions
// once real content is migrated; the registry will aggregate them then.
export const PROMPT_REGISTRY: Record<PromptId, PromptDefinition> = {};

export function getPrompt(id: PromptId): PromptDefinition | undefined {
  return PROMPT_REGISTRY[id];
}
