/** Batch 172 source metadata keys carried on catalyst_events.facts (flat, sanitizeFacts-safe). */

export const CATALYST_SOURCE_METADATA_FACT_KEYS = [
  "earnings_disposition",
  "source_identity",
  "published_at_unavailable",
  "calendar_only",
] as const;

export type CatalystSourceMetadataFactKey = (typeof CATALYST_SOURCE_METADATA_FACT_KEYS)[number];

export function pickCatalystSourceMetadataFacts(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const src = metadata ?? {};
  const out: Record<string, unknown> = {};
  for (const key of CATALYST_SOURCE_METADATA_FACT_KEYS) {
    const v = src[key];
    if (key === "published_at_unavailable" || key === "calendar_only") {
      if (v === true) out[key] = true;
      continue;
    }
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}
