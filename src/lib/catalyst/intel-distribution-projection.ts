/** Client mirror of supabase/functions/_shared/catalyst-intelligence/distribution-projection.ts */

import { projectIntelCatalystEventFacts } from "@/lib/catalyst/intel-catalyst-event-facts-projection";
import { resolvePrimaryDistributionTicker } from "@/lib/catalyst/intel-distribution-ticker";
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

function earningsDedupeKey(symbol: string, reportDate: string): string {
  return `earnings:${symbol}:${reportDate}`;
}

function secDedupeKey(accessionNumber: string, symbol: string): string {
  return `sec:${accessionNumber}:${symbol}`;
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

function readSecAccession(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  for (const key of ["accession", "accession_number", "accessionNumber"] as const) {
    const raw = metadata[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
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
  const resolved = resolvePrimaryDistributionTicker(input.tickers);
  if (!resolved) {
    return { row: null, rejectReason: "missing_ticker" };
  }
  const { symbol } = resolved;

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

export type PublicFeedCollisionAction =
  | "allow_upsert"
  | "skip_intel_preserve_existing"
  | "reject_intel_ambiguous_sec";

export function assessPublicFeedCollision(input: {
  projected: Pick<IntelPublicRowProjection, "dedupe_key" | "symbol" | "event_date" | "event_type">;
  existingDedupeKeys: ReadonlySet<string>;
  persistMetadata?: Record<string, unknown>;
}): { action: PublicFeedCollisionAction; reason: string | null; matchedKey: string | null } {
  const { projected, existingDedupeKeys } = input;
  if (existingDedupeKeys.has(projected.dedupe_key)) {
    return { action: "allow_upsert", reason: "idempotent_intel_key", matchedKey: projected.dedupe_key };
  }
  if (projected.event_type === "earnings") {
    const earningsKey = earningsDedupeKey(projected.symbol, projected.event_date);
    if (existingDedupeKeys.has(earningsKey)) {
      return {
        action: "skip_intel_preserve_existing",
        reason: "earnings_calendar_row_present",
        matchedKey: earningsKey,
      };
    }
  }
  if (projected.event_type === "sec_filing_news") {
    const accession = readSecAccession(input.persistMetadata);
    if (!accession) {
      return { action: "reject_intel_ambiguous_sec", reason: "sec_accession_unresolved", matchedKey: null };
    }
    const secKey = secDedupeKey(accession, projected.symbol);
    if (existingDedupeKeys.has(secKey)) {
      return { action: "skip_intel_preserve_existing", reason: "sec_feed_exact_match", matchedKey: secKey };
    }
  }
  return { action: "allow_upsert", reason: null, matchedKey: null };
}
