// Radar ↔ verified catalyst association labels (pure). Display only — no scanner qualification.

import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { classifyFreshnessV2 } from "@/lib/catalyst/intelligence-v2";
import type { CatalystEvent } from "@/types/catalyst";

export type RadarCatalystAssociation =
  | "confirmed_current"
  | "historical_context";

export const RADAR_CATALYST_LEVEL_LABEL: Record<RadarCatalystAssociation, string> = {
  confirmed_current: "Verified catalyst",
  historical_context: "Historical catalyst context",
};

export const RADAR_UNVERIFIED_NEWS_LABEL = "Unverified news";
export const RADAR_CATALYST_UNAVAILABLE_LABEL = "Catalyst unavailable";
export const RADAR_CATALYST_PENDING_LABEL = "Catalyst check pending";

export function resolveRadarCatalystAssociation(
  entry: CatalystEnrichmentEntry,
  nowMs: number,
): RadarCatalystAssociation {
  if (entry.kind === "upcoming") return "confirmed_current";
  const freshness = classifyFreshnessV2(entry.event, nowMs);
  if (freshness === "breaking" || freshness === "current") return "confirmed_current";
  return "historical_context";
}

export function formatCatalystSourceAttribution(event: Pick<CatalystEvent, "source_name" | "provider">): string | null {
  const name = event.source_name?.trim();
  if (name) return name;
  if (event.provider === "sec_edgar") return "SEC EDGAR";
  if (event.provider?.trim()) return event.provider;
  return null;
}
