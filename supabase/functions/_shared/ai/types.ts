// Shared AI type definitions for future LLM automation.
// Inert scaffold — no runtime behavior. Do not import from live edge functions yet.

export type AiTier = "fast" | "standard" | "deep";

export type AiProviderId =
  | "lovable"
  | "anthropic"
  | "openai"
  | "gemini"
  | "perplexity";

export type PromptId = string;

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  costCredits?: number;
}

export interface AiResult<T> {
  output: T;
  model: string;
  provider: AiProviderId;
  usage: AiUsage;
  cached: boolean;
  stale?: boolean;
  generatedAt: string; // ISO timestamp
}

export type AiMessageRole = "system" | "user" | "assistant" | "tool";

export interface AiMessage {
  role: AiMessageRole;
  content: string;
  name?: string;
}

export interface AiPromptInput<TVars = Record<string, unknown>> {
  promptId: PromptId;
  variables?: TVars;
  tier?: AiTier;
  preferProvider?: AiProviderId;
  userId?: string;
  feature?: string;
}

export interface AiPromptResponse<T = unknown> extends AiResult<T> {
  promptId: PromptId;
}
