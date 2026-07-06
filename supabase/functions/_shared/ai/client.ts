// Future runPrompt() contract. Inert stub — DO NOT import from runtime code yet.
// No provider calls, no fetch, no Supabase, no env access.

import type { AiPromptInput, AiPromptResponse } from "./types.ts";

export async function runPrompt<T = unknown>(
  _input: AiPromptInput,
): Promise<AiPromptResponse<T>> {
  // Intentional: this scaffold is not wired to any provider yet.
  // Migration of chat / generate-daily-brief / analyze-watchlist-tickers
  // to route through runPrompt() happens in a later sprint.
  throw new Error("AI scaffold is not wired yet. Runtime migration pending.");
}
