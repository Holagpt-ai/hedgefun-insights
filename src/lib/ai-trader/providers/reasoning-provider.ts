import type { AiTraderModelRole } from "@/lib/ai-trader/domain/models";

export interface ReasoningRequest {
  role: AiTraderModelRole;
  schemaVersion: string;
  input: Record<string, unknown>;
  untrustedTextRefs: readonly string[];
}

export interface ReasoningResult<T = unknown> {
  output: T;
  providerId: string;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
}

/**
 * Vendor-neutral reasoning boundary.
 * Sprint 2A has no implementation and no selected provider.
 */
export interface ReasoningProvider {
  id: string;
  complete<T>(request: ReasoningRequest): Promise<ReasoningResult<T>>;
}

export interface ModelRegistry {
  resolve(role: AiTraderModelRole, asOf: string): null;
}

export const EMPTY_MODEL_REGISTRY: ModelRegistry = {
  resolve() {
    return null;
  },
};
