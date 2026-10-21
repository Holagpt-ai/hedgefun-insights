import { readIntelFactsFromEvent } from "@/lib/catalyst/catalyst-intel-facts";
import { mapToTaxonomyV2 } from "@/lib/catalyst/intelligence-v2";
import type { CatalystEvent } from "@/types/catalyst";
import type { CatalystReactionEvidence } from "@/lib/catalyst/catalyst-reaction-evidence";
import { readReactionEvidenceFromEvent } from "@/lib/catalyst/catalyst-reaction-evidence";

export type CatalystEvidenceNode =
  | { kind: "company"; symbol: string; securityId: string | null; label: string | null }
  | { kind: "event"; eventId: string; taxonomy: string; title: string }
  | { kind: "source"; provider: string; sourceName: string; sourceUrl: string | null }
  | { kind: "reaction"; evidence: CatalystReactionEvidence };

export type CatalystEvidenceEdge =
  | { kind: "company_event"; symbol: string; eventId: string }
  | { kind: "event_source"; eventId: string; provider: string }
  | { kind: "event_reaction"; eventId: string; window: string | null };

export interface CatalystEvidenceGraph {
  nodes: CatalystEvidenceNode[];
  edges: CatalystEvidenceEdge[];
  /** Explicit non-causation disclaimer for any reaction edge. */
  reactionDisclaimer: string;
}

export const CATALYST_REACTION_NON_CAUSATION =
  "Observed market metrics are stored separately from the event record. Timing proximity does not establish that the event caused price or volume changes.";

export function buildCatalystEvidenceGraph(event: CatalystEvent): CatalystEvidenceGraph {
  const intel = readIntelFactsFromEvent(event);
  const taxonomy = mapToTaxonomyV2(event.event_type, event.title, event.description);
  const reaction = readReactionEvidenceFromEvent(event);
  const nodes: CatalystEvidenceNode[] = [
    {
      kind: "company",
      symbol: event.symbol.toUpperCase(),
      securityId: intel.securityId,
      label: event.company_name,
    },
    {
      kind: "event",
      eventId: event.id,
      taxonomy,
      title: event.title,
    },
    {
      kind: "source",
      provider: event.provider,
      sourceName: event.source_name,
      sourceUrl: event.source_url,
    },
  ];
  const edges: CatalystEvidenceEdge[] = [
    { kind: "company_event", symbol: event.symbol.toUpperCase(), eventId: event.id },
    { kind: "event_source", eventId: event.id, provider: event.provider },
  ];
  if (reaction) {
    nodes.push({ kind: "reaction", evidence: reaction });
    edges.push({
      kind: "event_reaction",
      eventId: event.id,
      window: reaction.window ?? null,
    });
  }
  return {
    nodes,
    edges,
    reactionDisclaimer: CATALYST_REACTION_NON_CAUSATION,
  };
}
