/** Client mirror of supabase/functions/_shared/catalyst/intel-catalyst-event-facts-projection.ts */

import { pickCatalystSourceMetadataFacts } from "@/lib/catalyst/catalyst-source-metadata-facts";

export function mergedIntelPersistMetadata(
  candidate: { raw: { metadata: Record<string, unknown> }; metadata: Record<string, unknown> },
): Record<string, unknown> {
  return { ...candidate.raw.metadata, ...candidate.metadata };
}

export function projectIntelCatalystEventFacts(input: {
  metadata: Record<string, unknown>;
  lifecycle: string;
  verificationState: string;
  materiality: number;
  ingestedAt: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...pickCatalystSourceMetadataFacts(input.metadata),
    intel_lifecycle: input.lifecycle,
    intel_verification: input.verificationState,
    intel_materiality: input.materiality,
    intel_ingested_at: input.ingestedAt,
  };
  const sanitized: Record<string, unknown> = {};
  const forbidden = /(score|confidence|weight|weighted|rank|tier|band)/i;
  for (const [k, v] of Object.entries(out)) {
    if (forbidden.test(k)) continue;
    if (v === null) continue;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      if (t === "number" && !Number.isFinite(v as number)) continue;
      sanitized[k] = v;
    }
  }
  return sanitized;
}
