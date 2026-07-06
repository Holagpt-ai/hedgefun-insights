// Provider interface contracts for future LLM adapters.
// Inert scaffold — no implementations included.

import type {
  AiMessage,
  AiProviderId,
  AiTier,
  AiUsage,
} from "../types.ts";

export interface AiProviderTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface AiProviderChatOptions {
  model: string;
  system?: string;
  messages: AiMessage[];
  tools?: AiProviderTool[];
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  tier?: AiTier;
  signal?: AbortSignal;
}

export interface AiProviderChatResponse<T = unknown> {
  text: string;
  json?: T;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  usage: AiUsage;
  model: string;
  provider: AiProviderId;
  stopReason?: string;
}

export interface AiProvider {
  id: AiProviderId;
  supportsTools: boolean;
  supportsJsonSchema: boolean;
  chat<T = unknown>(
    opts: AiProviderChatOptions,
  ): Promise<AiProviderChatResponse<T>>;
}
