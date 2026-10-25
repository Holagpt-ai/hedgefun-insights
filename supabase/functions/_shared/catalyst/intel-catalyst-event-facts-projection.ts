import { pickCatalystSourceMetadataFacts } from "./catalyst-source-metadata-facts.ts";
import { sanitizeFacts } from "./sanitize.ts";

/** Merge normalize metadata into raw metadata before raw_items insert. */
export function mergedIntelPersistMetadata(
  candidate: { raw: { metadata: Record<string, unknown> }; metadata: Record<string, unknown> },
): Record<string, unknown> {
  return { ...candidate.raw.metadata, ...candidate.metadata };
}

/** Project intel canonical state + persisted metadata into public catalyst_events.facts shape. */
export function projectIntelCatalystEventFacts(input: {
  metadata: Record<string, unknown>;
  lifecycle: string;
  verificationState: string;
  materiality: number;
  ingestedAt: string;
}): Record<string, unknown> {
  return sanitizeFacts({
    ...pickCatalystSourceMetadataFacts(input.metadata),
    intel_lifecycle: input.lifecycle,
    intel_verification: input.verificationState,
    intel_materiality: input.materiality,
    intel_ingested_at: input.ingestedAt,
  });
}
