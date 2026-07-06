// Provider-selection scaffold. Inert — no provider implementations, no env,
// no fetch. Real provider registration happens in a later sprint.

import type { AiProviderId, AiTier } from "./types.ts";
import type { AiProvider } from "./providers/types.ts";

export interface ProviderSelectionInput {
  tier?: AiTier;
  preferProvider?: AiProviderId;
  feature?: string;
}

// Default preference order for future provider selection / failover.
// Kept as data only; no provider modules are imported here.
export const DEFAULT_PROVIDER_ORDER: readonly AiProviderId[] = [
  "lovable",
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
] as const;

// Placeholder registry. Populated in a later sprint when adapters land.
const PROVIDER_REGISTRY: Partial<Record<AiProviderId, AiProvider>> = {};

export function registerProvider(_provider: AiProvider): void {
  // Intentionally a no-op in the scaffold sprint.
  // A later sprint will assign into PROVIDER_REGISTRY.
  void PROVIDER_REGISTRY;
}

export function selectProvider(_input: ProviderSelectionInput = {}): AiProvider {
  throw new Error(
    "AI provider gateway is not wired yet. Runtime migration pending.",
  );
}
