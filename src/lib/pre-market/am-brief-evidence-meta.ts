/**
 * Deterministic AM brief evidence metadata (client). Reads persisted market_snapshot only.
 */

export type CatalystFeedStatus = "verified" | "none" | "unavailable";

export function readCatalystFeedStatusFromBriefSnapshot(snapshot: unknown): CatalystFeedStatus | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const enrichment = (snapshot as Record<string, unknown>).intelligence_enrichment;
  if (!enrichment || typeof enrichment !== "object" || Array.isArray(enrichment)) return null;
  const raw = (enrichment as Record<string, unknown>).catalyst_feed_status;
  if (raw === "verified" || raw === "none" || raw === "unavailable") return raw;
  return null;
}

export function catalystFeedStatusLabel(status: CatalystFeedStatus | null): string | null {
  if (!status) return null;
  switch (status) {
    case "verified":
      return "Catalyst feeds verified";
    case "none":
      return "No direct catalyst rows in evidence window";
    case "unavailable":
      return "Catalyst feed unavailable for this brief";
  }
}
