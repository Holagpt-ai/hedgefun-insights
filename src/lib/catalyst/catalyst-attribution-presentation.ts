/**
 * Cross-surface catalyst attribution labels and source lines.
 * Radar, Catalyst, Watchlist, and Market Pulse share this vocabulary.
 */

import type { CatalystEvent } from "@/types/catalyst";
import {
  buildCatalystSourceEvidenceSummary,
  resolvePublishedTimestampState,
} from "@/lib/catalyst/source-evidence-contract";
import { formatCatalystSourceAttribution } from "@/lib/catalyst/radar-momentum-catalyst-context";
import type { RadarCatalystAssociation } from "@/lib/catalyst/radar-momentum-catalyst-context";

export type CatalystAttributionTier =
  | "direct_verified"
  | "sector_context"
  | "unverified_association"
  | "none";

export const CATALYST_ATTRIBUTION_TIER_LABEL: Record<
  Exclude<CatalystAttributionTier, "none">,
  string
> = {
  direct_verified: "Direct verified catalyst",
  sector_context: "Related sector / market context",
  unverified_association: "Unverified association",
};

export const CATALYST_MOVEMENT_CAUSATION_DISCLAIMER =
  "Source-backed company or market event. Event timing and publication date shown when available. Causation not established.";

export function resolveCatalystAttributionTier(
  event: Pick<CatalystEvent, "attribution_class" | "ticker_specific"> | null | undefined,
): CatalystAttributionTier {
  if (!event) return "none";
  const cls = event.attribution_class;
  if (cls === "sector_related") return "sector_context";
  if (event.ticker_specific === false) return "unverified_association";
  if (cls === "unverified" || cls === null) return "unverified_association";
  if (cls === "direct" || cls === "provider_associated") return "direct_verified";
  return "unverified_association";
}

export function catalystAttributionDisplayLabel(input: {
  event: Pick<CatalystEvent, "attribution_class" | "ticker_specific"> | null | undefined;
  radarAssociation?: RadarCatalystAssociation;
}): string {
  const tier = resolveCatalystAttributionTier(input.event);
  if (tier === "none") return "No verified catalyst";
  if (tier === "direct_verified") {
    if (input.radarAssociation === "historical_context") {
      return "Historical catalyst context";
    }
    return "Verified catalyst";
  }
  return CATALYST_ATTRIBUTION_TIER_LABEL[tier];
}

export function buildCrossSurfaceSourceAttributionLine(
  event: CatalystEvent,
  nowMs: number = Date.now(),
): string | null {
  const summary = buildCatalystSourceEvidenceSummary(event, nowMs);
  const publisher = formatCatalystSourceAttribution(event);
  const parts: string[] = [];
  if (publisher) parts.push(publisher);
  if (summary.sourceIdentity && summary.sourceIdentity !== publisher) {
    parts.push(summary.sourceIdentity);
  }
  if (summary.publishedState === "unavailable") {
    parts.push("Publication time unavailable");
  } else if (summary.publishedState === "present" && summary.publishedAt) {
    parts.push(
      `Published ${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/New_York",
      }).format(new Date(summary.publishedAt))} ET`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Stable identity for dedupe checks across surfaces (dedupe_key + canonical URL). */
export function catalystEventSurfaceIdentity(event: CatalystEvent): string {
  const summary = buildCatalystSourceEvidenceSummary(event);
  const url = summary.canonicalUrl ?? event.source_url ?? "";
  return `${summary.dedupeKey}|${event.symbol.toUpperCase()}|${url}`;
}

export function catalystPublicationTimestampState(event: CatalystEvent): ReturnType<
  typeof resolvePublishedTimestampState
> {
  return resolvePublishedTimestampState(event);
}
