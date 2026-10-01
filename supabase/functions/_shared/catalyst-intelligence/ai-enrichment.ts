// Optional AI enrichment boundary.
// V1 does not call a provider. The deterministic pipeline is complete without it.
// A future implementation may use the existing Anthropic gateway; it must
// validate output and must not invent source facts. No cross-provider fallback.

import { AI_ENRICHMENT_FLAG, readFlag } from "./config.ts";
import type { NormalizedEventCandidate } from "./types.ts";

export interface AiEnrichmentSuggestion {
  summary: string | null;
  eventType: string | null;
  rejected: boolean;
  reason: string;
}

export interface CatalystAiEnricher {
  enrich(candidate: NormalizedEventCandidate): Promise<AiEnrichmentSuggestion | null>;
}

export function aiEnrichmentEnabled(env: (key: string) => string | undefined): boolean {
  return readFlag(env(AI_ENRICHMENT_FLAG)) === true;
}

/** Default enricher performs no network call and returns null. */
export const disabledAiEnricher: CatalystAiEnricher = {
  enrich() {
    return Promise.resolve(null);
  },
};

export async function maybeEnrichCandidate(
  candidate: NormalizedEventCandidate,
  enabled: boolean,
  enricher: CatalystAiEnricher = disabledAiEnricher,
): Promise<AiEnrichmentSuggestion | null> {
  if (!enabled) return null;
  const suggestion = await enricher.enrich(candidate);
  if (!suggestion) return null;
  if (suggestion.rejected) return null;
  if (suggestion.summary && suggestion.summary.length > 500) return null;
  return suggestion;
}
