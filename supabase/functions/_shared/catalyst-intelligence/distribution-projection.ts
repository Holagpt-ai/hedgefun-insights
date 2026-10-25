import type { CatalystEventRow, CatalystEventType, TimeOfDay } from "../catalyst/contract.ts";
import {
  earningsDedupeKey,
  isValidTicker,
  nonEmptyTrimmed,
  polygonDedupeKey,
} from "../catalyst/contract.ts";
import { sanitizeFacts } from "../catalyst/sanitize.ts";
import { projectIntelCatalystEventFacts } from "../catalyst/intel-catalyst-event-facts-projection.ts";
import type {
  CanonicalEvent,
  EvidenceRecord,
  IntelEventType,
  TickerLink,
  VerificationState,
} from "./types.ts";

export const CATALYST_INTELLIGENCE_PROVIDER = "catalyst_intelligence";
export const INTEL_DISTRIBUTION_DEDUPE_PREFIX = "intel:v1:";

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
  const id = eventId.trim();
  return `${INTEL_DISTRIBUTION_DEDUPE_PREFIX}${id}`;
}

export function mapIntelEventTypeToPublic(eventType: IntelEventType): CatalystEventType {
  return INTEL_TO_PUBLIC_TYPE[eventType] ?? "company_news";
}

function ymdFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveEventDate(event: CanonicalEvent): string | null {
  return (
    ymdFromIso(event.announcementAt) ??
    ymdFromIso(event.sourcePublishedAt) ??
    (event.scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(event.scheduledDate) ? event.scheduledDate : null) ??
    ymdFromIso(event.scheduledStartAt)
  );
}

function primaryEvidence(evidence: readonly EvidenceRecord[]): EvidenceRecord | null {
  return evidence.find((row) => row.evidenceRole === "primary") ?? evidence[0] ?? null;
}

function attributionClassForVerification(verification: VerificationState): "direct" | "provider_associated" {
  if (verification === "VERIFIED_PRIMARY" || verification === "VERIFIED_MULTI_SOURCE") return "direct";
  return "provider_associated";
}

export interface IntelDistributionProjectionInput {
  event: CanonicalEvent;
  tickers: readonly TickerLink[];
  evidence: readonly EvidenceRecord[];
  persistMetadata?: Record<string, unknown>;
  companyName?: string | null;
}

export interface IntelDistributionProjectionResult {
  row: CatalystEventRow | null;
  rejectReason: "missing_event_date" | "missing_ticker" | null;
}

export function projectIntelToPublicCatalystRow(
  input: IntelDistributionProjectionInput,
): IntelDistributionProjectionResult {
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
  const sourceUrl = pe?.canonicalUrl && pe.canonicalUrl.startsWith("https://") ? pe.canonicalUrl : null;
  const publishedAt = input.event.sourcePublishedAt ?? pe?.publishedAt ?? null;

  const related = input.tickers
    .filter((row) => row.ticker.toUpperCase() !== symbol)
    .map((row) => row.ticker.trim().toUpperCase())
    .filter((t) => isValidTicker(t));

  const facts = sanitizeFacts({
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
  });

  const title = nonEmptyTrimmed(input.event.title) ?? `${symbol} catalyst`;
  const description = nonEmptyTrimmed(input.event.announcementSummary ?? input.event.summary);

  const row: CatalystEventRow = {
    dedupe_key: intelDistributionDedupeKey(input.event.id),
    symbol,
    company_name: input.companyName?.trim() || null,
    event_type: mapIntelEventTypeToPublic(input.event.eventType),
    verification_state: "provider_reported",
    event_date: eventDate,
    event_time: publishedAt,
    time_of_day: null as TimeOfDay | null,
    title,
    description,
    source_name: pe?.authorityKey?.trim() || "Catalyst Intelligence",
    source_url: sourceUrl,
    provider: CATALYST_INTELLIGENCE_PROVIDER,
    provider_article_id: input.event.id,
    related_symbols: related,
    facts,
    published_at: publishedAt,
  };

  return { row, rejectReason: null };
}

export type PublicFeedCollisionAction = "allow_upsert" | "skip_intel_preserve_existing";

export interface PublicFeedCollisionInput {
  projected: Pick<
    CatalystEventRow,
    "dedupe_key" | "symbol" | "event_date" | "source_url" | "provider" | "event_type"
  >;
  existingDedupeKeys: ReadonlySet<string>;
}

export interface PublicFeedCollisionResult {
  action: PublicFeedCollisionAction;
  reason: string | null;
  matchedKey: string | null;
}

/** Prevent intel writes from clobbering SEC, Polygon, or earnings-calendar rows. */
export function assessPublicFeedCollision(input: PublicFeedCollisionInput): PublicFeedCollisionResult {
  const { projected, existingDedupeKeys } = input;
  const intelKey = projected.dedupe_key;

  if (existingDedupeKeys.has(intelKey)) {
    return { action: "allow_upsert", reason: "idempotent_intel_key", matchedKey: intelKey };
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

/** Helper for tests simulating polygon collision by article id. */
export function polygonKeyForArticle(articleId: string, symbol: string): string {
  return polygonDedupeKey(articleId, symbol);
}
