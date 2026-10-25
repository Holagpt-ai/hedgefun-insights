/** Client mirror of supabase/functions/_shared/catalyst-intelligence/distribution-projection.ts */

import { projectIntelCatalystEventFacts } from "@/lib/catalyst/intel-catalyst-event-facts-projection";
import type { CatalystEventType } from "@/types/catalyst";
import type {
  CanonicalEventLike,
  EvidenceRecordLike,
  IntelEventType,
  TickerLinkLike,
  VerificationState,
} from "@/lib/catalyst/intel-distribution-types";

export const CATALYST_INTELLIGENCE_PROVIDER = "catalyst_intelligence";
export const INTEL_DISTRIBUTION_DEDUPE_PREFIX = "intel:v1:";

const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

function isValidTicker(x: string): boolean {
  return TICKER_REGEX.test(x);
}

function earningsDedupeKey(symbol: string, reportDate: string): string {
  return `earnings:${symbol}:${reportDate}`;
}

const INTEL_TO_PUBLIC_TYPE: Record<IntelEventType, CatalystEventType> = {
  EARNINGS: "earnings",
  GUIDANCE: "company_news",
  SEC_FILING: "sec_filing_news",
  FINANCING: "corporate_action",
  DILUTION: "corporate_action",
  M_AND_A: "merger_acquisition",
  EXECUTIVE_CHANGE: "company_news",
  CONTRACT: "product_contract",
  PARTNERSHIP: "product_contract",
  PRODUCT_LAUNCH: "product_contract",
  PRODUCT_STRATEGY_EVENT: "company_news",
  INVESTOR_EVENT: "company_news",
  CONFERENCE: "company_news",
  REGULATORY: "company_news",
  FDA_CLINICAL: "fda_biotech",
  LEGAL: "legal",
  ANALYST_ACTION: "analyst_action",
  CORPORATE_ACTION: "corporate_action",
  OTHER_MATERIAL_EVENT: "company_news",
};

export function intelDistributionDedupeKey(eventId: string): string {
  return `${INTEL_DISTRIBUTION_DEDUPE_PREFIX}${eventId.trim()}`;
}

export function mapIntelEventTypeToPublic(eventType: IntelEventType): CatalystEventType {
  return INTEL_TO_PUBLIC_TYPE[eventType] ?? "company_news";
}

function ymdFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function resolveEventDate(event: CanonicalEventLike): string | null {
  return (
    ymdFromIso(event.announcementAt) ??
    ymdFromIso(event.sourcePublishedAt) ??
    (event.scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(event.scheduledDate) ? event.scheduledDate : null) ??
    ymdFromIso(event.scheduledStartAt)
  );
}

function primaryEvidence(evidence: readonly EvidenceRecordLike[]): EvidenceRecordLike | null {
  return evidence.find((row) => row.evidenceRole === "primary") ?? evidence[0] ?? null;
}

function attributionClassForVerification(verification: VerificationState): "direct" | "provider_associated" {
  if (verification === "VERIFIED_PRIMARY" || verification === "VERIFIED_MULTI_SOURCE") return "direct";
  return "provider_associated";
}

export interface IntelPublicRowProjection {
  dedupe_key: string;
  symbol: string;
  event_type: CatalystEventType;
  verification_state: "provider_reported";
  event_date: string;
  source_url: string | null;
  provider: string;
  published_at: string | null;
  facts: Record<string, unknown>;
}

export interface IntelDistributionProjectionInput {
  event: CanonicalEventLike;
  tickers: readonly TickerLinkLike[];
  evidence: readonly EvidenceRecordLike[];
  persistMetadata?: Record<string, unknown>;
}

export function projectIntelToPublicCatalystRow(
  input: IntelDistributionProjectionInput,
): { row: IntelPublicRowProjection | null; rejectReason: "missing_event_date" | "missing_ticker" | null } {
  const primary = input.tickers.find((row) => row.isPrimary) ?? input.tickers[0] ?? null;
  const symbol = primary?.ticker?.trim().toUpperCase() ?? "";
  if (!isValidTicker(symbol)) {
    return { row: null, rejectReason: "missing_ticker" };
  }

  const eventDate = resolveEventDate(input.event);
  if (!eventDate) {
    return { row: null, rejectReason: "missing_event_date" };
  }

  const pe = primaryEvidence(input.evidence);
  const sourceUrl = pe?.canonicalUrl?.startsWith("https://") ? pe.canonicalUrl : null;
  const publishedAt = input.event.sourcePublishedAt ?? pe?.publishedAt ?? null;

  const facts = {
    ...projectIntelCatalystEventFacts({
      metadata: input.persistMetadata ?? {},
      lifecycle: input.event.lifecycle,
      verificationState: input.event.verificationState,
      materiality: input.event.materiality,
      ingestedAt: input.event.firstDiscoveredAt,
    }),
    attribution_class: attributionClassForVerification(input.event.verificationState),
    ticker_specific: true,
    intel_distribution_event_id: input.event.id,
    intel_canonical_key: input.event.canonicalKey,
  };

  return {
    row: {
      dedupe_key: intelDistributionDedupeKey(input.event.id),
      symbol,
      event_type: mapIntelEventTypeToPublic(input.event.eventType),
      verification_state: "provider_reported",
      event_date: eventDate,
      source_url: sourceUrl,
      provider: CATALYST_INTELLIGENCE_PROVIDER,
      published_at: publishedAt,
      facts,
    },
    rejectReason: null,
  };
}

export type PublicFeedCollisionAction = "allow_upsert" | "skip_intel_preserve_existing";

export function assessPublicFeedCollision(input: {
  projected: Pick<IntelPublicRowProjection, "dedupe_key" | "symbol" | "event_date" | "event_type">;
  existingDedupeKeys: ReadonlySet<string>;
}): { action: PublicFeedCollisionAction; reason: string | null; matchedKey: string | null } {
  const { projected, existingDedupeKeys } = input;
  if (existingDedupeKeys.has(projected.dedupe_key)) {
    return { action: "allow_upsert", reason: "idempotent_intel_key", matchedKey: projected.dedupe_key };
  }
  const earningsKey = earningsDedupeKey(projected.symbol, projected.event_date);
  if (existingDedupeKeys.has(earningsKey)) {
    return {
      action: "skip_intel_preserve_existing",
      reason: "earnings_calendar_row_present",
      matchedKey: earningsKey,
    };
  }
  if (projected.event_type === "sec_filing_news") {
    for (const key of existingDedupeKeys) {
      if (key.startsWith("sec:")) {
        return { action: "skip_intel_preserve_existing", reason: "sec_feed_namespace", matchedKey: key };
      }
    }
  }
  return { action: "allow_upsert", reason: null, matchedKey: null };
}
