/** Client mirror of supabase/functions/_shared/catalyst-intelligence/distribution-eligibility.ts */

import type {
  CanonicalEventLike,
  EvidenceRecordLike,
  TickerLinkLike,
} from "@/lib/catalyst/intel-distribution-types";

export const INTEL_DISTRIBUTION_REJECT_CODES = [
  "distribution_observation_only",
  "unresolved_ticker",
  "invalidated_lifecycle",
  "invalidated_verification",
  "conflicting_verification",
  "unverified_insufficient",
  "evidence_conflict",
  "no_provenance",
  "schedule_only_calendar",
  "future_schedule_not_announced",
  "routine_observation",
  "missing_event_date",
] as const;

export type IntelDistributionRejectCode = (typeof INTEL_DISTRIBUTION_REJECT_CODES)[number];

const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

function isValidTicker(x: string): boolean {
  return TICKER_REGEX.test(x);
}

export interface IntelDistributionEligibilityInput {
  event: CanonicalEventLike;
  tickers: readonly TickerLinkLike[];
  evidence: readonly EvidenceRecordLike[];
  persistMetadata?: Record<string, unknown>;
  now: Date;
}

export interface IntelDistributionEligibility {
  eligible: boolean;
  rejectCode: IntelDistributionRejectCode | null;
  detail: string | null;
}

const BLOCKED_VERIFICATION = new Set([
  "UNVERIFIED",
  "CONFLICTING",
  "INVALIDATED",
]);

const SCHEDULE_ONLY_LIFECYCLE = new Set(["discovered", "scheduled", "approaching"]);

const ANNOUNCED_LIFECYCLE = new Set([
  "live",
  "announced",
  "reacting",
  "follow_through",
  "resolved",
]);

const CALENDAR_HEAVY_TYPES = new Set(["EARNINGS", "INVESTOR_EVENT", "CONFERENCE"]);

function primaryTicker(tickers: readonly TickerLinkLike[]): string | null {
  const primary = tickers.find((row) => row.isPrimary) ?? tickers[0] ?? null;
  const t = primary?.ticker?.trim().toUpperCase() ?? "";
  return isValidTicker(t) ? t : null;
}

function hasProvenance(evidence: readonly EvidenceRecordLike[]): boolean {
  return evidence.some((row) => {
    const url = row.canonicalUrl?.trim() ?? "";
    if (url.startsWith("https://")) return true;
    const pub = row.publishedAt?.trim() ?? "";
    return pub.length > 0 && Number.isFinite(Date.parse(pub));
  });
}

function metadataFlag(metadata: Record<string, unknown>, key: string): boolean {
  return metadata[key] === true;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const raw = metadata[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function isFutureScheduleOnly(input: IntelDistributionEligibilityInput): boolean {
  const { event, persistMetadata = {} } = input;
  if (ANNOUNCED_LIFECYCLE.has(event.lifecycle)) return false;
  if (event.announcementAt && Number.isFinite(Date.parse(event.announcementAt))) return false;
  if (event.sourcePublishedAt && Number.isFinite(Date.parse(event.sourcePublishedAt))) return false;

  const earningsDisposition = metadataString(persistMetadata, "earnings_disposition");
  if (earningsDisposition === "schedule_announced") return true;
  if (metadataFlag(persistMetadata, "calendar_only")) return true;

  if (!CALENDAR_HEAVY_TYPES.has(event.eventType)) return false;
  if (!SCHEDULE_ONLY_LIFECYCLE.has(event.lifecycle)) return false;

  const scheduledMs = event.scheduledStartAt
    ? Date.parse(event.scheduledStartAt)
    : event.scheduledDate
    ? Date.parse(`${event.scheduledDate}T12:00:00.000Z`)
    : NaN;
  if (!Number.isFinite(scheduledMs)) return false;
  return scheduledMs > input.now.getTime();
}

export function assessIntelDistributionEligibility(
  input: IntelDistributionEligibilityInput,
): IntelDistributionEligibility {
  const { event, evidence } = input;

  if (event.distributionStatus !== "ready") {
    return {
      eligible: false,
      rejectCode: "distribution_observation_only",
      detail: "distribution_status_not_ready",
    };
  }

  if (event.lifecycle === "invalidated") {
    return { eligible: false, rejectCode: "invalidated_lifecycle", detail: event.lifecycle };
  }

  if (event.verificationState === "INVALIDATED") {
    return { eligible: false, rejectCode: "invalidated_verification", detail: event.verificationState };
  }

  if (event.verificationState === "CONFLICTING" || evidence.some((row) => row.conflict)) {
    return {
      eligible: false,
      rejectCode: event.verificationState === "CONFLICTING" ? "conflicting_verification" : "evidence_conflict",
      detail: "conflicting_attribution_or_schedule",
    };
  }

  if (BLOCKED_VERIFICATION.has(event.verificationState)) {
    return {
      eligible: false,
      rejectCode: "unverified_insufficient",
      detail: event.verificationState,
    };
  }

  const ticker = primaryTicker(input.tickers);
  if (!ticker) {
    return { eligible: false, rejectCode: "unresolved_ticker", detail: "missing_primary_ticker" };
  }

  if (!hasProvenance(evidence)) {
    return { eligible: false, rejectCode: "no_provenance", detail: "no_url_or_published_at" };
  }

  if (event.eventSubtype === "market_commentary") {
    return { eligible: false, rejectCode: "routine_observation", detail: event.eventSubtype };
  }

  const meta = input.persistMetadata ?? {};
  if (metadataFlag(meta, "calendar_only")) {
    return { eligible: false, rejectCode: "schedule_only_calendar", detail: "calendar_only" };
  }

  if (isFutureScheduleOnly(input)) {
    return {
      eligible: false,
      rejectCode: "future_schedule_not_announced",
      detail: "scheduled_future_without_announcement",
    };
  }

  return { eligible: true, rejectCode: null, detail: null };
}
