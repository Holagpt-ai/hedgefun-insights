/**
 * Batch 23 — attach verified Stocksist Catalyst records to Market Pulse movements.
 * Explicit ticker identity and source evidence only; never infer causation from timing.
 */

import { canonicalUrl } from "@/lib/catalyst/attribution";
import { CATALYST_MOVEMENT_CAUSATION_DISCLAIMER } from "@/lib/catalyst/catalyst-attribution-presentation";
import {
  catalystSymbolHref,
  ENRICHMENT_RECENT_MS,
  type CatalystEnrichmentEntry,
} from "@/lib/catalyst/enrichment";
import { looksLikeLegalShareholderNoticeText } from "@/lib/catalyst/legal-notice";
import { eventMomentMs, normalizeSymbol } from "@/lib/catalyst/parsers";
import { classifyCatalystRelevance } from "@/lib/catalyst/relevance";
import type { CatalystEvent } from "@/types/catalyst";
import type {
  MarketPulseIntelligenceRecord,
  MarketPulseSessionEvidence,
  MarketPulseVerifiedCatalyst,
} from "./market-pulse-contract";
export const MARKET_PULSE_CAUSATION_DISCLAIMER = CATALYST_MOVEMENT_CAUSATION_DISCLAIMER;

export const MARKET_PULSE_UNEXPLAINED_COPY =
  "Meaningful price movement without a verified catalyst event linked from Stocksist records.";

/** Per-row neutral line when enrichment found no verified catalyst (section holds the long explanation). */
export const MARKET_PULSE_ROW_NO_CATALYST = "No verified catalyst linked.";

const RELEVANCE_OK = new Set(["DIRECT", "PRIMARY"]);

function persistedAttributionBlocks(event: CatalystEvent): boolean {
  if (event.attribution_class === "sector_related" || event.attribution_class === "unverified") {
    return true;
  }
  if (event.ticker_specific === false) return true;
  return false;
}

function hasSourceEvidence(event: CatalystEvent): boolean {
  const url = canonicalUrl(event.source_url);
  if (url) return true;
  return typeof event.source_name === "string" && event.source_name.trim().length >= 2;
}

function eventWithinMovementReferenceWindow(
  eventMs: number,
  observationMs: number | null,
  nowMs: number,
  sessionEvidence: MarketPulseSessionEvidence,
): boolean {
  const refMs = observationMs ?? nowMs;
  const lookback =
    sessionEvidence === "prior_session_historical"
      ? 7 * 86_400_000
      : ENRICHMENT_RECENT_MS;
  const earliest = refMs - lookback;
  const latest = refMs + 86_400_000;
  return eventMs >= earliest && eventMs <= latest;
}

function formatEventTimingLine(event: CatalystEvent): string | null {
  const parts: string[] = [];
  if (event.event_date) parts.push(`Event date ${event.event_date}`);
  if (event.published_at && Number.isFinite(Date.parse(event.published_at))) {
    parts.push(
      `Published ${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/New_York",
      }).format(new Date(event.published_at))} ET`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Returns a verified catalyst presentation row when Stocksist evidence is sufficient.
 * Proximity to the price observation is a display window only — not causation.
 */
export function resolveVerifiedCatalystForPulse(input: {
  symbol: string;
  entry: CatalystEnrichmentEntry | undefined;
  observationMs: number | null;
  sessionEvidence: MarketPulseSessionEvidence;
  nowMs: number;
  /** When true, temporal eligibility requires a verified price observation timestamp. */
  requirePriceObservationMs?: boolean;
}): MarketPulseVerifiedCatalyst | null {
  const sym = normalizeSymbol(input.symbol);
  const entry = input.entry;
  if (!sym || !entry) return null;
  if (input.requirePriceObservationMs && input.observationMs === null) return null;

  const event = entry.event;
  if (entry.kind !== "recent") return null;
  if (normalizeSymbol(event.symbol) !== sym) return null;
  if (event.verification_state !== "provider_reported") return null;
  if (persistedAttributionBlocks(event)) return null;
  if (!event.title?.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date)) return null;
  if (!hasSourceEvidence(event)) return null;
  if (looksLikeLegalShareholderNoticeText(event.title, event.description, event.source_name)) {
    return null;
  }

  const relevance = classifyCatalystRelevance({
    attribution: {
      title: event.title,
      description: event.description,
      symbol: event.symbol,
      companyName: event.company_name,
      providerTickers: [event.symbol, ...(event.related_symbols ?? [])],
      providerAssociatesSymbol: true,
    },
    eventType: event.event_type,
  });

  if (!RELEVANCE_OK.has(relevance.class) || !relevance.tickerSpecific) return null;
  if (event.ticker_specific === false) return null;

  const eventMs = eventMomentMs(event);
  if (eventMs === null) return null;
  if (
    !eventWithinMovementReferenceWindow(
      eventMs,
      input.observationMs,
      input.nowMs,
      input.sessionEvidence,
    )
  ) {
    return null;
  }

  const catalystPath = catalystSymbolHref(sym);
  if (!catalystPath) return null;

  return {
    label: "Verified event",
    eventId: event.id,
    title: event.title.trim(),
    sourceName: event.source_name.trim(),
    sourceUrl: canonicalUrl(event.source_url),
    eventDate: event.event_date,
    publishedAt: event.published_at,
    eventTimingLine: formatEventTimingLine(event),
    catalystPath,
    causationEstablished: false,
  };
}

function observationMsForRecord(record: MarketPulseIntelligenceRecord, nowMs: number): number | null {
  if (record.observationFreshnessMs !== null && Number.isFinite(record.observationFreshnessMs)) {
    return nowMs - record.observationFreshnessMs;
  }
  return null;
}

export function attachMarketPulseCatalystContext(
  items: readonly MarketPulseIntelligenceRecord[],
  enrichment: Map<string, CatalystEnrichmentEntry> | undefined,
  nowMs: number,
): MarketPulseIntelligenceRecord[] {
  return items.map((item) => {
    const observationMs = observationMsForRecord(item, nowMs);
    const symKey = normalizeSymbol(item.symbol);
    const entry = symKey ? enrichment?.get(symKey) : undefined;
    const verifiedCatalyst = resolveVerifiedCatalystForPulse({
      symbol: item.symbol,
      entry,
      observationMs,
      sessionEvidence: item.sessionEvidence,
      nowMs,
    });

    if (verifiedCatalyst) {
      return {
        ...item,
        movementContext: "verified_movement_with_event",
        verifiedCatalyst,
        relatedHeadline: null,
        catalystEvidenceUrl: verifiedCatalyst.sourceUrl,
        catalystEvidenceAt: verifiedCatalyst.publishedAt ?? verifiedCatalyst.eventDate,
      };
    }

    return {
      ...item,
      movementContext: "verified_movement_unexplained",
      verifiedCatalyst: null,
      relatedHeadline: null,
      catalystEvidenceUrl: null,
      catalystEvidenceAt: null,
    };
  });
}
